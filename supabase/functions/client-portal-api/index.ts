import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.1";
import postgres from "npm:postgres@3.4.5";

import {
  FLOW_LABELS,
  STATUS_LABELS,
  isDocumentValidationMode,
  normalizeOptionalString,
} from "../_shared/project-tracking.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!databaseUrl || !supabaseUrl || !serviceRoleKey) {
  throw new Error("Configuracao do backend incompleta.");
}

const sql = postgres(databaseUrl, {
  max: 4,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

const authClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type ClientPortalPayload = {
  action?: unknown;
  project_id?: unknown;
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

type SessionContext = {
  userId: string;
  fullName: string;
  email: string | null;
};

type StepStatus = "pending" | "current" | "completed";

type LinkedProjectSummary = {
  id: string;
  currentTrackingLeadId: string | null;
  clientPortalUserId: string | null;
  clientName: string | null;
  companyName: string | null;
  displayName: string | null;
  flowType: "company_opening" | "existing_company";
  flowLabel: string;
  status: "active" | "completed" | "paused";
  statusLabel: string;
  updatedAt: string;
  trackingCode: string;
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fail = (message: string, status = 400) => json({ error: message }, status);

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

const getDocumentValidationMode = async () => {
  const [settings] = await sql`
    select document_validation_mode
    from public.project_tracking_settings
    limit 1
  `;

  return isDocumentValidationMode(settings?.document_validation_mode)
    ? settings.document_validation_mode
    : "optional";
};

const buildStepStatus = ({
  explicitStatus,
  position,
  currentPosition,
  projectStatus,
}: {
  explicitStatus: string | null;
  position: number;
  currentPosition: number | null;
  projectStatus: "active" | "completed" | "paused";
}): StepStatus => {
  if (explicitStatus === "completed" || explicitStatus === "current" || explicitStatus === "pending") {
    if (projectStatus === "completed" && explicitStatus === "current") return "completed";
    return explicitStatus;
  }

  if (projectStatus === "completed") return "completed";
  if (currentPosition === null) return "pending";
  if (position < currentPosition) return "completed";
  if (position === currentPosition) return "current";
  return "pending";
};

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

const buildTimeline = (currentKey: keyof typeof timelineBase) => {
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

const buildReferralSource = (referrerName: string) => `Valle Indicacao: ${referrerName}`;

const getValleFunnelId = async () => {
  const [funnel] = await sql`
    select id
    from public.funnels
    where lower(trim(name)) = lower('Valle Consultores')
    limit 1
  `;

  if (!funnel) {
    throw new Error("Funil Valle Consultores nao encontrado.");
  }

  return funnel.id as string;
};

const getSessionContext = async (req: Request): Promise<SessionContext> => {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Response("Sessao nao encontrada.", { status: 401 });

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new Response("Sessao invalida ou expirada.", { status: 401 });

  const userId = data.user.id;
  const [profile] = await sql`
    select
      full_name,
      email,
      access_status::text as access_status,
      is_active
    from public.profiles
    where id = ${userId}
    limit 1
  `;

  if (!profile) throw new Response("Perfil do cliente nao encontrado.", { status: 404 });

  if (profile.access_status !== "active" || profile.is_active === false) {
    throw new Response("Seu acesso ao portal do cliente ainda nao esta liberado.", { status: 403 });
  }

  const [role] = await sql`
    select role
    from public.user_roles
    where user_id = ${userId}
      and role = 'cliente'
    limit 1
  `;

  if (!role) {
    throw new Response("Esta conta nao possui acesso ao portal do cliente.", { status: 403 });
  }

  return {
    userId,
    fullName: (profile.full_name as string | null) ?? data.user.user_metadata?.full_name ?? data.user.email?.split("@")[0] ?? "Cliente",
    email: (profile.email as string | null) ?? data.user.email ?? null,
  };
};

const getLinkedProjects = async (userId: string): Promise<LinkedProjectSummary[]> => {
  const rows = await sql`
    select
      id::text as id,
      current_tracking_lead_id::text as current_tracking_lead_id,
      client_portal_user_id::text as client_portal_user_id,
      client_name,
      company_name,
      flow_type,
      status,
      updated_at,
      tracking_code
    from public.project_tracking_projects
    where client_portal_user_id = ${userId}
    order by updated_at desc, created_at desc
  `;

  return rows.map((row) => ({
    id: row.id as string,
    currentTrackingLeadId: (row.current_tracking_lead_id as string | null) ?? null,
    clientPortalUserId: (row.client_portal_user_id as string | null) ?? null,
    clientName: (row.client_name as string | null) ?? null,
    companyName: (row.company_name as string | null) ?? null,
    displayName: (row.company_name as string | null) ?? (row.client_name as string | null) ?? null,
    flowType: row.flow_type as "company_opening" | "existing_company",
    flowLabel: FLOW_LABELS[row.flow_type as keyof typeof FLOW_LABELS],
    status: row.status as "active" | "completed" | "paused",
    statusLabel: STATUS_LABELS[row.status as keyof typeof STATUS_LABELS],
    updatedAt: row.updated_at as string,
    trackingCode: row.tracking_code as string,
  }));
};

const buildTrackingPayload = async (projectId: string) => {
  const documentValidationMode = await getDocumentValidationMode();

  const [project] = await sql`
    select
      id,
      client_name,
      company_name,
      tracking_code,
      flow_type,
      current_step_key,
      status,
      updated_at,
      completed_at
    from public.project_tracking_projects
    where id = ${projectId}
    limit 1
  `;

  if (!project) {
    throw new Response("Projeto de acompanhamento nao encontrado.", { status: 404 });
  }

  const [currentStep] = await sql`
    select step_key, position, public_name, public_description
    from public.project_tracking_step_catalog
    where flow_type = ${project.flow_type as string}
      and step_key = ${project.current_step_key as string | null}
    limit 1
  `;

  const currentPosition = (currentStep?.position as number | undefined) ?? null;

  const stepRows = await sql`
    select
      catalog.step_key,
      catalog.public_name,
      catalog.public_description,
      catalog.position,
      history.status as history_status
    from public.project_tracking_step_catalog catalog
    left join public.project_tracking_step_history history
      on history.project_id = ${project.id as string}
     and history.flow_type = catalog.flow_type
     and history.step_key = catalog.step_key
    where catalog.flow_type = ${project.flow_type as string}
      and catalog.is_active = true
    order by catalog.position asc
  `;

  const steps = stepRows.map((row) => ({
    stepKey: row.step_key as string,
    publicName: row.public_name as string,
    publicDescription: row.public_description as string,
    order: row.position as number,
    status: buildStepStatus({
      explicitStatus: (row.history_status as string | null) ?? null,
      position: row.position as number,
      currentPosition,
      projectStatus: project.status as "active" | "completed" | "paused",
    }),
  }));

  const completedSteps = steps.filter((step) => step.status === "completed").length;
  const totalSteps = steps.length || 1;
  const progressPercentage = project.status === "completed"
    ? 100
    : Math.round((completedSteps / totalSteps) * 100);

  const currentStepPayload =
    project.status === "completed"
      ? steps[steps.length - 1] ?? null
      : steps.find((step) => step.status === "current") ?? steps[0] ?? null;

  const flowSummaries = await sql`
    select
      history.flow_type,
      bool_and(history.status = 'completed') as all_completed,
      max(history.completed_at) as completed_at
    from public.project_tracking_step_history history
    where history.project_id = ${project.id as string}
    group by history.flow_type
  `;

  const previousOpeningPhase = flowSummaries.find((row) =>
    row.flow_type === "company_opening" &&
    row.all_completed === true &&
    project.flow_type === "existing_company"
  );

  return {
    ok: true,
    trackingCode: project.tracking_code,
    documentValidationMode,
    clientName: project.client_name,
    companyName: project.company_name,
    displayName: project.company_name || project.client_name,
    flowType: project.flow_type,
    flowLabel: FLOW_LABELS[project.flow_type as keyof typeof FLOW_LABELS],
    status: project.status,
    statusLabel: STATUS_LABELS[project.status as keyof typeof STATUS_LABELS],
    currentStepKey: project.current_step_key,
    progressPercentage,
    updatedAt: project.updated_at,
    completedAt: project.completed_at,
    currentStep: currentStepPayload
      ? {
        stepKey: currentStepPayload.stepKey,
        publicName: currentStepPayload.publicName,
        publicDescription: currentStepPayload.publicDescription,
        status: project.status === "completed" ? "completed" : currentStepPayload.status,
      }
      : null,
    steps,
    previousPhase: previousOpeningPhase
      ? {
        flowType: "company_opening",
        flowLabel: FLOW_LABELS.company_opening,
        completedAt: previousOpeningPhase.completed_at,
        title: "Abertura da empresa concluida",
        description:
          "A fase de abertura foi concluida e agora seguimos com a implantacao do atendimento contabil.",
      }
      : null,
    finalMessage: project.status === "completed"
      ? "Processo concluido! Agora seguimos com a rotina de atendimento da sua empresa."
      : null,
  };
};

const getValleFunnelAndStage = async () => {
  const funnelId = await getValleFunnelId();

  const [preferredStage] = await sql`
    select id
    from public.pipeline_stages
    where funnel_id = ${funnelId}
      and key = 'novo_lead'
      and is_won = false
      and is_lost = false
    limit 1
  `;

  if (preferredStage) {
    return {
      funnelId,
      stageId: preferredStage.id as string,
    };
  }

  const [stage] = await sql`
    select id
    from public.pipeline_stages
    where funnel_id = ${funnelId}
      and is_won = false
      and is_lost = false
    order by position asc, created_at asc
    limit 1
  `;

  if (!stage) {
    throw new Error("Nenhuma etapa inicial disponivel no funil Valle Consultores.");
  }

  return {
    funnelId,
    stageId: stage.id as string,
  };
};

const resolveActiveProject = (
  projects: LinkedProjectSummary[],
  requestedProjectId: string | null,
) => {
  if (projects.length === 0) return null;
  if (!requestedProjectId) return projects[0];
  return projects.find((project) => project.id === requestedProjectId) ?? null;
};

const notifyValleAdminsAboutClientLogin = async (ctx: SessionContext) => {
  const linkedProjects = await getLinkedProjects(ctx.userId);
  if (linkedProjects.length > 0) {
    return { notifiedAdminCount: 0, skipped: true as const };
  }

  const valleFunnelId = await getValleFunnelId();
  const recipients = await sql`
    select p.id::text as id
    from public.profiles p
    where p.access_status = 'active'
      and p.is_active = true
      and exists (
        select 1
        from public.user_roles ur
        where ur.user_id = p.id
          and ur.role = 'admin'
      )
      and (
        p.has_all_funnel_access = true
        or exists (
          select 1
          from public.user_funnel_access ufa
          where ufa.user_id = p.id
            and ufa.funnel_id = ${valleFunnelId}
        )
      )
  `;

  if (recipients.length === 0) {
    return { notifiedAdminCount: 0, skipped: false as const };
  }

  const recipientIds = recipients.map((recipient) => recipient.id as string);
  const existingRows = await sql`
    select recipient_user_id::text as recipient_user_id
    from public.user_notifications
    where recipient_user_id = any(${recipientIds})
      and kind = 'client_portal_login'
      and read_at is null
      and metadata->>'client_user_id' = ${ctx.userId}
  `;

  const existingRecipientIds = new Set(existingRows.map((row) => row.recipient_user_id as string));
  const title = "Cliente acessou o portal";
  const message = ctx.email
    ? `${ctx.fullName} (${ctx.email}) entrou no portal do cliente e ainda nao foi vinculado a um cliente do acompanhamento.`
    : `${ctx.fullName} entrou no portal do cliente e ainda nao foi vinculado a um cliente do acompanhamento.`;

  let notifiedAdminCount = 0;

  for (const recipientId of recipientIds) {
    if (existingRecipientIds.has(recipientId)) continue;

    await sql`
      insert into public.user_notifications (
        recipient_user_id,
        kind,
        title,
        message,
        href,
        metadata
      ) values (
        ${recipientId},
        ${"client_portal_login"},
        ${title},
        ${message},
        ${"/acompanhamento"},
        ${{
          client_user_id: ctx.userId,
          client_name: ctx.fullName,
          client_email: ctx.email,
          source_funnel_id: valleFunnelId,
        }}
      )
    `;

    notifiedAdminCount += 1;
  }

  return { notifiedAdminCount, skipped: false as const };
};

const handleOverview = async (ctx: SessionContext) => {
  const projects = await getLinkedProjects(ctx.userId);
  const [referralCountRow] = await sql`
    select count(*)::int as count
    from public.referral_program_entries
    where referrer_user_id = ${ctx.userId}
  `;

  return json({
    ok: true,
    client: {
      id: ctx.userId,
      fullName: ctx.fullName,
      email: ctx.email,
    },
    projects,
    referralsCount: Number(referralCountRow?.count ?? 0),
  });
};

const handleRecordLogin = async (ctx: SessionContext) => {
  const result = await notifyValleAdminsAboutClientLogin(ctx);
  return json({ ok: true, ...result });
};

const handleProject = async (ctx: SessionContext, body: ClientPortalPayload) => {
  const requestedProjectId = normalizeOptionalString(body.project_id);
  const projects = await getLinkedProjects(ctx.userId);
  const activeProject = resolveActiveProject(projects, requestedProjectId);

  if (requestedProjectId && !activeProject) {
    return fail("Projeto nao encontrado para este cliente.", 404);
  }

  return json({
    ok: true,
    client: {
      id: ctx.userId,
      fullName: ctx.fullName,
      email: ctx.email,
    },
    projects,
    activeProjectId: activeProject?.id ?? null,
    tracking: activeProject ? await buildTrackingPayload(activeProject.id) : null,
  });
};

const handleReferralList = async (ctx: SessionContext, body: ClientPortalPayload) => {
  const requestedProjectId = normalizeOptionalString(body.project_id);
  const projects = await getLinkedProjects(ctx.userId);
  const activeProject = resolveActiveProject(projects, requestedProjectId);

  if (requestedProjectId && !activeProject) {
    return fail("Projeto nao encontrado para este cliente.", 404);
  }

  const rows = await sql`
    select
      r.id::text as id,
      r.access_token,
      r.created_at as referral_created_at,
      r.updated_at as referral_updated_at,
      l.company_or_person,
      l.contact_name,
      l.updated_at as lead_updated_at,
      ps.key as stage_key,
      ps.name as stage_name,
      ps.is_won,
      ps.is_lost
    from public.referral_program_entries r
    join public.leads l on l.id = r.lead_id
    join public.pipeline_stages ps on ps.id = l.stage_id
    where r.referrer_user_id = ${ctx.userId}
    order by r.created_at desc
  `;

  const referrals = rows.map((row) => {
    const currentKey = getPublicStageKey({
      stageKey: (row.stage_key as string | null) ?? null,
      stageName: (row.stage_name as string | null) ?? null,
      isWon: Boolean(row.is_won),
      isLost: Boolean(row.is_lost),
    }) as keyof typeof timelineBase;

    return {
      id: row.id as string,
      trackingToken: row.access_token as string,
      createdAt: row.referral_created_at as string,
      updatedAt: (row.lead_updated_at as string | null) ?? (row.referral_updated_at as string),
      referredCompanyOrPerson: row.company_or_person as string,
      referredContactName: (row.contact_name as string | null) ?? null,
      currentStage: {
        key: currentKey,
        label: timelineBase[currentKey].label,
        description: timelineBase[currentKey].description,
        isTerminal: currentKey === "won" || currentKey === "lost",
        isWon: currentKey === "won",
        isLost: currentKey === "lost",
      },
      timeline: buildTimeline(currentKey),
      reward: buildRewardModel(currentKey),
    };
  });

  return json({
    ok: true,
    client: {
      id: ctx.userId,
      fullName: ctx.fullName,
      email: ctx.email,
    },
    projects,
    activeProjectId: activeProject?.id ?? null,
    referrals,
  });
};

const handleSubmitReferral = async (ctx: SessionContext, body: ClientPortalPayload) => {
  const requestedProjectId = normalizeOptionalString(body.project_id);
  const projects = await getLinkedProjects(ctx.userId);
  const activeProject = resolveActiveProject(projects, requestedProjectId);

  if (requestedProjectId && !activeProject) {
    return fail("Projeto nao encontrado para este cliente.", 404);
  }

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

  if (!referredContactName) return fail("Informe o nome do contato indicado.");
  if (!referredEmail) return fail("Informe o e-mail do contato indicado.");
  if (countPhoneDigits(referredPhone) < 10) return fail("Informe um telefone valido do contato indicado.");

  const referredLeadName = referredCompanyOrPerson ?? referredContactName;
  const referrerCompany = activeProject?.companyName ?? activeProject?.clientName ?? null;
  const landingPath = normalizeOptionalString(body.landing_path);
  const externalReferrer = normalizeOptionalString(body.referrer);
  const utmSource = normalizeOptionalString(body.utm_source);
  const utmMedium = normalizeOptionalString(body.utm_medium);
  const utmCampaign = normalizeOptionalString(body.utm_campaign);
  const utmTerm = normalizeOptionalString(body.utm_term);
  const utmContent = normalizeOptionalString(body.utm_content);

  const { funnelId, stageId } = await getValleFunnelAndStage();

  const duplicateRows = await sql`
    select id
    from public.leads
    where funnel_id = ${funnelId}
      and created_at >= now() - interval '10 minutes'
      and (
        phone = ${referredPhone}
        or email = ${referredEmail}
      )
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
    referrerName: ctx.fullName,
    referrerCompany,
    referrerEmail: ctx.email,
    referrerPhone: null,
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
      ${buildReferralSource(ctx.fullName)},
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
      referrer_user_id,
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
      ${ctx.userId},
      ${ctx.fullName},
      ${referrerCompany},
      ${ctx.email},
      ${null},
      ${referredContactName},
      ${referredEmail},
      ${"premiacao_hipotetica_v1"}
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail("Metodo nao permitido.", 405);

  try {
    const body = (await req.json().catch(() => ({}))) as ClientPortalPayload;
    const ctx = await getSessionContext(req);
    const action = normalizeOptionalString(body.action) ?? "overview";

    if (action === "overview") {
      return await handleOverview(ctx);
    }

    if (action === "record_login") {
      return await handleRecordLogin(ctx);
    }

    if (action === "project") {
      return await handleProject(ctx, body);
    }

    if (action === "list_referrals") {
      return await handleReferralList(ctx, body);
    }

    if (action === "submit_referral") {
      return await handleSubmitReferral(ctx, body);
    }

    return fail("Acao invalida.", 400);
  } catch (error) {
    if (error instanceof Response) {
      const message = await error.text();
      return fail(message || "Erro no portal do cliente.", error.status || 500);
    }
    console.error(error);
    const message = error instanceof Error ? error.message : "Erro inesperado no portal do cliente.";
    return fail(message, 500);
  }
});
