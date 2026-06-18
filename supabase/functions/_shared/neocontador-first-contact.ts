const AUTOMATION_KIND = "neocontador_first_contact";
const FUNNEL_NAME = "Neocontador";
const FIRST_CONTACT_STAGE_KEY = "primeiro_contato";
const CONTACT_METHOD = "email";

type SqlClient = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => PromiseLike<Array<Record<string, unknown>>>;

type LeadSnapshot = {
  id: string;
  funnel_id: string;
  stage_id: string;
  company_or_person: string | null;
  contact_name: string | null;
  email: string | null;
  entity_kind: string | null;
  funnel_name: string | null;
  funnel_module: string | null;
  has_been_contacted: boolean | null;
};

type AutomationResult =
  | { status: "skipped"; reason: string }
  | { status: "sent"; resendEmailId: string | null }
  | { status: "failed"; reason: string };

const normalizeTextKey = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const isValidEmail = (value: string | null | undefined) =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const getLeadLabel = (lead: LeadSnapshot) =>
  lead.company_or_person?.trim() || lead.contact_name?.trim() || "Lead";

const buildFirstContactEmail = (lead: LeadSnapshot) => {
  const contactName = lead.contact_name?.trim();
  const greeting = contactName ? `Ola, ${escapeHtml(contactName)}.` : "Ola.";
  const leadLabel = escapeHtml(getLeadLabel(lead));

  const text = [
    contactName ? `Ola, ${contactName}.` : "Ola.",
    "",
    `Recebemos seu contato sobre ${getLeadLabel(lead)} e ja estamos avaliando as informacoes enviadas.`,
    "Em breve nossa equipe retorna com os proximos passos.",
    "",
    "Atenciosamente,",
    "Equipe Neocontador",
  ].join("\n");

  const html = [
    `<p>${greeting}</p>`,
    `<p>Recebemos seu contato sobre <strong>${leadLabel}</strong> e ja estamos avaliando as informacoes enviadas.</p>`,
    "<p>Em breve nossa equipe retorna com os proximos passos.</p>",
    "<p>Atenciosamente,<br>Equipe Neocontador</p>",
  ].join("");

  return {
    subject: "Recebemos seu contato",
    text,
    html,
  };
};

const readResendConfig = () => {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
  const fromEmail =
    Deno.env.get("RESEND_FROM_EMAIL")?.trim() ??
    "";
  const replyToEmail = Deno.env.get("RESEND_REPLY_TO_EMAIL")?.trim() ?? "";

  if (!apiKey) return { ok: false as const, reason: "RESEND_API_KEY nao configurada." };
  if (!fromEmail) return { ok: false as const, reason: "RESEND_FROM_EMAIL nao configurada." };

  return {
    ok: true as const,
    apiKey,
    fromEmail,
    replyToEmail: replyToEmail || null,
  };
};

const getLeadSnapshot = async (sql: SqlClient, leadId: string) => {
  const [lead] = await sql`
    select
      lead.id::text as id,
      lead.funnel_id::text as funnel_id,
      lead.stage_id::text as stage_id,
      lead.company_or_person,
      lead.contact_name,
      lead.email,
      coalesce(lead.entity_kind, 'lead') as entity_kind,
      lead.has_been_contacted,
      funnel.name as funnel_name,
      funnel.module as funnel_module
    from public.leads lead
    join public.funnels funnel on funnel.id = lead.funnel_id
    where lead.id = ${leadId}
    limit 1
  `;

  return (lead ?? null) as LeadSnapshot | null;
};

const getFirstContactStageId = async (sql: SqlClient, funnelId: string) => {
  const [stage] = await sql`
    select id::text as id
    from public.pipeline_stages
    where funnel_id = ${funnelId}
      and key = ${FIRST_CONTACT_STAGE_KEY}
      and is_won = false
      and is_lost = false
    limit 1
  `;

  return typeof stage?.id === "string" ? stage.id : null;
};

const reserveDelivery = async (sql: SqlClient, leadId: string, recipientEmail: string) => {
  const [reservation] = await sql`
    insert into public.lead_email_deliveries as deliveries (
      lead_id,
      kind,
      recipient_email,
      status,
      error_message
    ) values (
      ${leadId},
      ${AUTOMATION_KIND},
      ${recipientEmail},
      'pending',
      null
    )
    on conflict (lead_id, kind) do update
    set recipient_email = excluded.recipient_email,
        status = 'pending',
        error_message = null,
        updated_at = now()
    where deliveries.status <> 'sent'
    returning id::text as id
  `;

  return typeof reservation?.id === "string" ? reservation.id : null;
};

const markDeliverySent = async (
  sql: SqlClient,
  deliveryId: string,
  resendEmailId: string | null,
) => {
  await sql`
    update public.lead_email_deliveries
    set status = 'sent',
        resend_email_id = ${resendEmailId},
        error_message = null,
        sent_at = now(),
        updated_at = now()
    where id = ${deliveryId}
  `;
};

const markDeliveryFailed = async (sql: SqlClient, deliveryId: string, reason: string) => {
  await sql`
    update public.lead_email_deliveries
    set status = 'failed',
        error_message = ${reason},
        updated_at = now()
    where id = ${deliveryId}
  `;
};

const sendFirstContactEmail = async (lead: LeadSnapshot, recipientEmail: string) => {
  const config = readResendConfig();
  if (!config.ok) throw new Error(config.reason);

  const email = buildFirstContactEmail(lead);
  const payload: Record<string, unknown> = {
    from: config.fromEmail,
    to: [recipientEmail],
    subject: email.subject,
    html: email.html,
    text: email.text,
  };

  if (config.replyToEmail) {
    payload.reply_to = config.replyToEmail;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `${AUTOMATION_KIND}:${lead.id}`,
    },
    body: JSON.stringify(payload),
  });

  const responsePayload = await response.json().catch(() => null) as
    | { id?: string; message?: string; error?: string }
    | null;

  if (!response.ok) {
    const message = responsePayload?.message ?? responsePayload?.error ?? `Resend retornou HTTP ${response.status}.`;
    throw new Error(message);
  }

  return typeof responsePayload?.id === "string" ? responsePayload.id : null;
};

export const runNeocontadorFirstContactAutomation = async ({
  sql,
  leadId,
  actorUserId = null,
}: {
  sql: SqlClient;
  leadId: string;
  actorUserId?: string | null;
}): Promise<AutomationResult> => {
  let deliveryId: string | null = null;
  let deliveryWasSent = false;

  try {
    const lead = await getLeadSnapshot(sql, leadId);
    if (!lead) return { status: "skipped", reason: "lead_not_found" };

    if (normalizeTextKey(lead.funnel_name) !== normalizeTextKey(FUNNEL_NAME)) {
      return { status: "skipped", reason: "not_neocontador" };
    }

    if ((lead.entity_kind ?? "lead") !== "lead" || lead.funnel_module === "customer_tracking") {
      return { status: "skipped", reason: "not_sales_lead" };
    }

    if (lead.has_been_contacted) {
      return { status: "skipped", reason: "already_contacted" };
    }

    const recipientEmail = lead.email?.trim().toLowerCase() ?? "";
    if (!isValidEmail(recipientEmail)) {
      return { status: "skipped", reason: "invalid_email" };
    }

    const firstContactStageId = await getFirstContactStageId(sql, lead.funnel_id);
    if (!firstContactStageId) {
      return { status: "skipped", reason: "first_contact_stage_not_found" };
    }

    deliveryId = await reserveDelivery(sql, lead.id, recipientEmail);
    if (!deliveryId) return { status: "skipped", reason: "already_sent" };

    const resendEmailId = await sendFirstContactEmail(lead, recipientEmail);
    await markDeliverySent(sql, deliveryId, resendEmailId);
    deliveryWasSent = true;

    await sql`
      update public.leads
      set stage_id = ${firstContactStageId},
          has_been_contacted = true,
          contact_method = ${CONTACT_METHOD}::public.contact_method,
          updated_by = ${actorUserId}
      where id = ${lead.id}
    `;

    await sql`
      insert into public.lead_activities (
        lead_id,
        type,
        description,
        metadata,
        contact_method,
        created_by,
        updated_by
      ) values (
        ${lead.id},
        'contact_logged',
        'Email de primeiro contato enviado automaticamente via Resend.',
        ${{ resend_email_id: resendEmailId, delivery_kind: AUTOMATION_KIND }},
        ${CONTACT_METHOD}::public.contact_method,
        ${actorUserId},
        ${actorUserId}
      )
    `;

    if (lead.stage_id !== firstContactStageId) {
      await sql`
        insert into public.lead_activities (
          lead_id,
          type,
          description,
          metadata,
          created_by,
          updated_by
        ) values (
          ${lead.id},
          'stage_change',
          'Lead movido automaticamente para Primeiro contato apos envio de email.',
          ${{ from: lead.stage_id, to: firstContactStageId, delivery_kind: AUTOMATION_KIND }},
          ${actorUserId},
          ${actorUserId}
        )
      `;
    }

    return { status: "sent", resendEmailId };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Falha inesperada na automacao de primeiro contato.";
    console.error("Neocontador first contact automation failed", { leadId, reason });

    if (deliveryId && !deliveryWasSent) {
      try {
        await markDeliveryFailed(sql, deliveryId, reason);
      } catch (markError) {
        console.error("Failed to persist first contact email failure", markError);
      }
    }

    return { status: "failed", reason };
  }
};
