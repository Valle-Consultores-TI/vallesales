import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import postgres from "npm:postgres@3.4.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const databaseUrl = Deno.env.get("SUPABASE_DB_URL");

if (!databaseUrl) {
  throw new Error("Configuracao do backend incompleta.");
}

const sql = postgres(databaseUrl, {
  max: 4,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

type ReferralPayload = {
  action?: unknown;
  tracking_token?: unknown;
  referrer_name?: unknown;
  referrer_company?: unknown;
  referrer_email?: unknown;
  referrer_phone?: unknown;
  referred_company_or_person?: unknown;
  referred_contact_name?: unknown;
  referred_email?: unknown;
  referred_phone?: unknown;
  city?: unknown;
  uf?: unknown;
  service_types?: unknown;
  notes?: unknown;
  hp_field?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  utm_term?: unknown;
  utm_content?: unknown;
  landing_path?: unknown;
  referrer?: unknown;
};

type TimelineStep = {
  key: string;
  label: string;
  description: string;
  status: "complete" | "current" | "upcoming";
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fail = (message: string, status = 400) => json({ error: message }, status);

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizePhone = (value: unknown) => {
  const raw = normalizeOptionalString(value);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
};

const countPhoneDigits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "").length;

const normalizeServiceTypes = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
};

const normalizeTextKey = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const buildTrackingBlock = ({
  notes,
  landingPath,
  externalReferrer,
  utmSource,
  utmMedium,
  utmCampaign,
  utmTerm,
  utmContent,
}: {
  notes: string | null;
  landingPath: string | null;
  externalReferrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
}) => {
  const blocks: string[] = [];

  if (notes) {
    blocks.push(["Contexto da indicacao", notes].join("\n"));
  }

  const trackingLines = [
    landingPath ? `Pagina: ${landingPath}` : null,
    externalReferrer ? `Referrer: ${externalReferrer}` : null,
    utmSource ? `utm_source: ${utmSource}` : null,
    utmMedium ? `utm_medium: ${utmMedium}` : null,
    utmCampaign ? `utm_campaign: ${utmCampaign}` : null,
    utmTerm ? `utm_term: ${utmTerm}` : null,
    utmContent ? `utm_content: ${utmContent}` : null,
  ].filter(Boolean) as string[];

  if (trackingLines.length > 0) {
    blocks.push(["Valle Indicacao", "Tracking", ...trackingLines].join("\n"));
  }

  return blocks.length > 0 ? blocks.join("\n\n") : null;
};

const buildLeadNotes = ({
  referrerName,
  referrerCompany,
  referrerEmail,
  referrerPhone,
  notes,
  landingPath,
  externalReferrer,
  utmSource,
  utmMedium,
  utmCampaign,
  utmTerm,
  utmContent,
}: {
  referrerName: string;
  referrerCompany: string | null;
  referrerEmail: string | null;
  referrerPhone: string | null;
  notes: string | null;
  landingPath: string | null;
  externalReferrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
}) => {
  const referrerBlock = [
    "Valle Indicacao",
    `Cliente que indicou: ${referrerName}`,
    referrerCompany ? `Empresa do cliente: ${referrerCompany}` : null,
    referrerEmail ? `E-mail do cliente: ${referrerEmail}` : null,
    referrerPhone ? `Telefone do cliente: ${referrerPhone}` : null,
  ].filter(Boolean) as string[];

  const trackingBlock = buildTrackingBlock({
    notes,
    landingPath,
    externalReferrer,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
  });

  return [referrerBlock.join("\n"), trackingBlock].filter(Boolean).join("\n\n");
};

const getValleFunnelAndStage = async () => {
  const [funnel] = await sql`
    select id, name
    from public.funnels
    where lower(trim(name)) = lower('Valle Consultores')
    limit 1
  `;

  if (!funnel) {
    throw new Error("Funil Valle Consultores nao encontrado.");
  }

  const [preferredStage] = await sql`
    select id, key, name
    from public.pipeline_stages
    where funnel_id = ${funnel.id as string}
      and key = 'novo_lead'
      and is_won = false
      and is_lost = false
    limit 1
  `;

  if (preferredStage) {
    return {
      funnelId: funnel.id as string,
      stageId: preferredStage.id as string,
    };
  }

  const [stage] = await sql`
    select id, key, name
    from public.pipeline_stages
    where funnel_id = ${funnel.id as string}
      and is_won = false
      and is_lost = false
    order by position asc, created_at asc
    limit 1
  `;

  if (!stage) {
    throw new Error("Nenhuma etapa inicial disponivel no funil Valle Consultores.");
  }

  return {
    funnelId: funnel.id as string,
    stageId: stage.id as string,
  };
};

const buildReferralSource = (referrerName: string) => `Valle Indicacao: ${referrerName}`;

const getPublicStageKey = ({
  stageKey,
  stageName,
  isWon,
  isLost,
}: {
  stageKey: string | null;
  stageName: string | null;
  isWon: boolean;
  isLost: boolean;
}) => {
  const normalizedKey = normalizeTextKey(stageKey);
  const normalizedName = normalizeTextKey(stageName);

  if (isLost) return "lost";
  if (isWon) return "won";
  if (normalizedKey.includes("negoci") || normalizedName.includes("negoci")) return "waiting";
  if (normalizedKey.includes("proposta") || normalizedName.includes("proposta")) return "proposal";
  if (normalizedKey.includes("reuniao") || normalizedName.includes("reuniao")) return "meeting";
  return "received";
};

const timelineBase = {
  received: {
    label: "Indicacao recebida",
    description: "Recebemos a indicacao e registramos o contato no funil da Valle.",
  },
  meeting: {
    label: "Reuniao agendada",
    description: "Nosso time conseguiu avancar para uma conversa com o contato indicado.",
  },
  proposal: {
    label: "Proposta enviada",
    description: "A proposta comercial ja foi apresentada ao lead.",
  },
  waiting: {
    label: "Aguardando resposta",
    description: "Estamos aguardando o retorno do lead sobre os proximos passos.",
  },
  won: {
    label: "Contrato fechado",
    description: "A oportunidade evoluiu para cliente da Valle.",
  },
  lost: {
    label: "Oportunidade nao avancou",
    description: "A indicacao foi encerrada e nao seguiu adiante neste momento.",
  },
} as const;

const buildTimeline = (currentKey: keyof typeof timelineBase): TimelineStep[] => {
  const orderedKeys = currentKey === "lost"
    ? ["received", "meeting", "proposal", "waiting", "lost"]
    : ["received", "meeting", "proposal", "waiting", "won"];

  const currentIndex = orderedKeys.indexOf(currentKey);

  return orderedKeys.map((key, index) => ({
    key,
    label: timelineBase[key as keyof typeof timelineBase].label,
    description: timelineBase[key as keyof typeof timelineBase].description,
    status:
      index < currentIndex
        ? "complete"
        : index === currentIndex
          ? "current"
          : "upcoming",
  }));
};

const buildRewardModel = (currentKey: keyof typeof timelineBase) => {
  if (currentKey === "won") {
    return {
      title: "Indicacao elegivel na simulacao",
      description:
        "Exemplo de regra: quando o contrato fecha, o cliente que indicou recebe um beneficio comercial, desconto ou bonus a ser definido pela politica final.",
      tone: "positive" as const,
    };
  }

  if (currentKey === "lost") {
    return {
      title: "Sem premiacao neste exemplo",
      description:
        "Como a oportunidade nao avancou, a simulacao de premiacao nao gera beneficio. A regra definitiva pode mudar depois.",
      tone: "muted" as const,
    };
  }

  return {
    title: "Indicacao em acompanhamento",
    description:
      "Exemplo de regra: o reconhecimento final seria liberado somente quando a oportunidade atingisse fechamento, mantendo a transparencia do processo para quem indicou.",
    tone: "neutral" as const,
  };
};

const handleSubmitReferral = async (body: ReferralPayload) => {
  const referrerName = normalizeOptionalString(body.referrer_name);
  const referrerCompany = normalizeOptionalString(body.referrer_company);
  const referrerEmail = normalizeOptionalString(body.referrer_email);
  const referrerPhone = normalizePhone(body.referrer_phone);
  const referredCompanyOrPerson = normalizeOptionalString(body.referred_company_or_person);
  const referredContactName = normalizeOptionalString(body.referred_contact_name);
  const referredEmail = normalizeOptionalString(body.referred_email);
  const referredPhone = normalizePhone(body.referred_phone);
  const city = normalizeOptionalString(body.city);
  const uf = normalizeOptionalString(body.uf);
  const serviceTypes = normalizeServiceTypes(body.service_types);
  const notes = normalizeOptionalString(body.notes);
  const hpField = normalizeOptionalString(body.hp_field);

  if (hpField) {
    return json({ ok: true, ignored: true });
  }

  if (!referrerName) return fail("Informe o nome de quem esta indicando.");
  if (!referrerEmail) return fail("Informe o e-mail de quem esta indicando.");
  if (countPhoneDigits(referrerPhone) < 10) return fail("Informe um telefone valido para quem esta indicando.");
  if (!referredContactName) return fail("Informe o nome do contato indicado.");
  if (countPhoneDigits(referredPhone) < 10) return fail("Informe um telefone valido do contato indicado.");

  const referredLeadName = referredCompanyOrPerson ?? referredContactName;

  const landingPath = normalizeOptionalString(body.landing_path);
  const externalReferrer = normalizeOptionalString(body.referrer);
  const utmSource = normalizeOptionalString(body.utm_source);
  const utmMedium = normalizeOptionalString(body.utm_medium);
  const utmCampaign = normalizeOptionalString(body.utm_campaign);
  const utmTerm = normalizeOptionalString(body.utm_term);
  const utmContent = normalizeOptionalString(body.utm_content);

  const { funnelId, stageId } = await getValleFunnelAndStage();

  const duplicateRows = referredEmail
    ? await sql`
        select id
        from public.leads
        where funnel_id = ${funnelId}
          and created_at >= now() - interval '10 minutes'
          and (
            phone = ${referredPhone}
            or email = ${referredEmail}
          )
        limit 1
      `
    : await sql`
        select id
        from public.leads
        where funnel_id = ${funnelId}
          and created_at >= now() - interval '10 minutes'
          and phone = ${referredPhone}
        limit 1
      `;

  const [recentDuplicate] = duplicateRows;

  if (recentDuplicate) {
    const [existingEntry] = await sql`
      select access_token
      from public.referral_program_entries
      where lead_id = ${recentDuplicate.id as string}
      limit 1
    `;

    if (existingEntry?.access_token) {
      return json({
        ok: true,
        duplicate: true,
        lead_id: recentDuplicate.id,
        tracking_token: existingEntry.access_token as string,
        referred_company_or_person: referredLeadName,
        referred_contact_name: referredContactName,
      });
    }

    return fail("Ja recebemos essa indicacao recentemente. Tente novamente em alguns minutos.", 409);
  }

  const leadNotes = buildLeadNotes({
    referrerName,
    referrerCompany,
    referrerEmail,
    referrerPhone,
    notes,
    landingPath,
    externalReferrer,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
  });

  const [createdLead] = await sql`
    insert into public.leads (
      funnel_id,
      company_or_person,
      company_maturity,
      contact_name,
      phone,
      email,
      city,
      uf,
      source,
      estimated_value,
      temperature,
      stage_id,
      has_been_contacted,
      notes,
      service_types
    ) values (
      ${funnelId},
      ${referredLeadName},
      'existing_company',
      ${referredContactName},
      ${referredPhone},
      ${referredEmail},
      ${city},
      ${uf},
      ${buildReferralSource(referrerName)},
      0,
      'morno',
      ${stageId},
      false,
      ${leadNotes || null},
      ${serviceTypes}
    )
    returning id, company_or_person, contact_name
  `;

  if (!createdLead?.id) {
    throw new Error("Nao foi possivel criar o lead indicado.");
  }

  const trackingToken = crypto.randomUUID().replace(/-/g, "");

  await sql`
    insert into public.referral_program_entries (
      lead_id,
      access_token,
      referrer_name,
      referrer_company,
      referrer_email,
      referrer_phone,
      referred_contact_name,
      referred_email,
      reward_model
    ) values (
      ${createdLead.id as string},
      ${trackingToken},
      ${referrerName},
      ${referrerCompany},
      ${referrerEmail},
      ${referrerPhone},
      ${referredContactName},
      ${referredEmail},
      ${'premiacao_hipotetica_v1'}
    )
  `;

  await sql`
    insert into public.lead_activities (lead_id, type, description)
    values (
      ${createdLead.id as string},
      'lead_created',
      ${`Lead criado via Valle Indicacao: ${createdLead.company_or_person as string}`}
    )
  `;

  return json(
    {
      ok: true,
      lead_id: createdLead.id,
      tracking_token: trackingToken,
      referred_company_or_person: createdLead.company_or_person,
      referred_contact_name: createdLead.contact_name,
    },
    201,
  );
};

const handleReferralStatus = async (body: ReferralPayload) => {
  const trackingToken = normalizeOptionalString(body.tracking_token);
  if (!trackingToken) return fail("Informe o codigo de acompanhamento.");

  const [entry] = await sql`
    select
      r.access_token,
      r.created_at as referral_created_at,
      r.updated_at as referral_updated_at,
      r.referrer_name,
      r.referrer_company,
      l.company_or_person,
      l.contact_name,
      l.email,
      l.phone,
      l.updated_at as lead_updated_at,
      ps.key as stage_key,
      ps.name as stage_name,
      ps.is_won,
      ps.is_lost
    from public.referral_program_entries r
    join public.leads l on l.id = r.lead_id
    join public.pipeline_stages ps on ps.id = l.stage_id
    where r.access_token = ${trackingToken}
    limit 1
  `;

  if (!entry) {
    return fail("Codigo de acompanhamento nao encontrado.", 404);
  }

  const currentKey = getPublicStageKey({
    stageKey: (entry.stage_key as string | null) ?? null,
    stageName: (entry.stage_name as string | null) ?? null,
    isWon: Boolean(entry.is_won),
    isLost: Boolean(entry.is_lost),
  }) as keyof typeof timelineBase;

  return json({
    ok: true,
    tracking_token: entry.access_token,
    created_at: entry.referral_created_at,
    updated_at: entry.lead_updated_at ?? entry.referral_updated_at,
    referrer_name: entry.referrer_name,
    referrer_company: entry.referrer_company,
    referred_company_or_person: entry.company_or_person,
    referred_contact_name: entry.contact_name,
    referred_email: entry.email,
    referred_phone: entry.phone,
    current_stage: {
      key: currentKey,
      label: timelineBase[currentKey].label,
      description: timelineBase[currentKey].description,
      is_terminal: currentKey === "won" || currentKey === "lost",
      is_won: currentKey === "won",
      is_lost: currentKey === "lost",
    },
    timeline: buildTimeline(currentKey),
    reward: buildRewardModel(currentKey),
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail("Metodo nao permitido.", 405);

  try {
    const body = (await req.json().catch(() => ({}))) as ReferralPayload;
    const action = normalizeOptionalString(body.action) ?? "submit";

    if (action === "status") {
      return await handleReferralStatus(body);
    }

    return await handleSubmitReferral(body);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Erro inesperado ao processar o Valle Indicacao.";
    return fail(message, 500);
  }
});
