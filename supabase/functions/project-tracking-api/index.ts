import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import postgres from "npm:postgres@3.4.5";

import {
  FLOW_LABELS,
  buildTrackingMessage,
  flowFromExistingCompanyFlag,
  isProjectTrackingFlowType,
  normalizeOptionalString,
  sanitizeDocumentNumber,
} from "../_shared/project-tracking.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-project-tracking-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
const trackingApiKey = Deno.env.get("PROJECT_TRACKING_API_KEY");
const publicAppUrl = Deno.env.get("PUBLIC_APP_URL") ?? "";

if (!databaseUrl) {
  throw new Error("Configuracao do backend incompleta.");
}

const sql = postgres(databaseUrl, {
  max: 4,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

type UpdatePayload = {
  crmDealId?: unknown;
  clientName?: unknown;
  companyName?: unknown;
  clientEmail?: unknown;
  client_email?: unknown;
  email?: unknown;
  documentNumber?: unknown;
  pipelineName?: unknown;
  stageName?: unknown;
  hasExistingCompany?: unknown;
  flowType?: unknown;
  currentInternalStage?: unknown;
  status?: unknown;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fail = (message: string, status = 400) => json({ error: message }, status);

const isAuthorized = (req: Request) => {
  if (!trackingApiKey) return true;

  const headerKey = req.headers.get("x-project-tracking-key");
  if (headerKey && headerKey === trackingApiKey) return true;

  const authorization = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  return authorization === trackingApiKey;
};

const normalizeStageName = (value: string | null) => (value ?? "").trim().toLowerCase();

const createOrUpdateProject = async (body: UpdatePayload) => {
  const crmDealId = normalizeOptionalString(body.crmDealId);
  const clientName = normalizeOptionalString(body.clientName);
  const companyName = normalizeOptionalString(body.companyName);
  const clientEmail = normalizeOptionalString(body.clientEmail ?? body.client_email ?? body.email);
  const documentNumber = sanitizeDocumentNumber(body.documentNumber);
  const pipelineName = normalizeOptionalString(body.pipelineName);
  const stageName = normalizeOptionalString(body.stageName);
  const currentInternalStage = normalizeOptionalString(body.currentInternalStage);

  if (!crmDealId) return fail("Informe o crmDealId.");

  const flowType = isProjectTrackingFlowType(body.flowType)
    ? body.flowType
    : flowFromExistingCompanyFlag(body.hasExistingCompany);

  const normalizedStageName = normalizeStageName(stageName);
  const normalizedInternalStage = normalizeStageName(currentInternalStage);

  const isOpeningCompleted = flowType === "company_opening" && (
    normalizedStageName.includes("concluido") ||
    normalizedInternalStage.includes("concluido") ||
    normalizedStageName.includes("fechado")
  );

  const [resolvedCurrentStep] = await sql`
    select public.resolve_project_tracking_step_key(
      ${flowType},
      ${currentInternalStage},
      ${stageName}
    ) as step_key
  `;

  let currentStepKey = (resolvedCurrentStep?.step_key as string | null) ?? null;

  if (!currentStepKey) {
    const [firstStep] = await sql`
      select step_key
      from public.project_tracking_step_catalog
      where flow_type = ${flowType}
        and is_active = true
      order by position asc
      limit 1
    `;
    currentStepKey = (firstStep?.step_key as string | null) ?? null;
  }

  const [existingProject] = await sql`
    select *
    from public.project_tracking_projects
    where crm_deal_id = ${crmDealId}
    limit 1
  `;

  let trackingCode = (existingProject?.tracking_code as string | null) ?? null;
  if (!trackingCode) {
    const [generated] = await sql`select public.generate_project_tracking_code() as tracking_code`;
    trackingCode = generated?.tracking_code as string;
  }

  let targetFlowType = flowType;
  let targetStepKey = currentStepKey;
  let targetStatus: "active" | "completed" | "paused" = "active";

  if (isOpeningCompleted) {
    targetFlowType = "existing_company";

    const [existingFirstStep] = await sql`
      select step_key
      from public.project_tracking_step_catalog
      where flow_type = 'existing_company'
        and is_active = true
      order by position asc
      limit 1
    `;

    targetStepKey = (existingFirstStep?.step_key as string | null) ?? currentStepKey;
  } else if (flowType === "existing_company" && (
    normalizedStageName.includes("concluido") ||
    normalizedInternalStage.includes("concluido") ||
    normalizeOptionalString(body.status) === "completed"
  )) {
    targetStatus = "completed";
  }

  const [upsertedProject] = await sql`
    insert into public.project_tracking_projects (
      crm_deal_id,
      client_name,
      company_name,
      client_email,
      client_email_normalized,
      tracking_code,
      tracking_code_normalized,
      document_number,
      document_number_normalized,
      crm_pipeline,
      crm_stage,
      flow_type,
      current_step_key,
      status,
      completed_at
    ) values (
      ${crmDealId},
      ${clientName},
      ${companyName},
      ${clientEmail},
      nullif(lower(trim(${clientEmail})), ''),
      ${trackingCode},
      public.normalize_tracking_code(${trackingCode}),
      ${documentNumber || null},
      nullif(public.normalize_document_number(${documentNumber || null}), ''),
      ${pipelineName},
      ${stageName},
      ${targetFlowType},
      ${targetStepKey},
      ${targetStatus},
      ${targetStatus === "completed" ? new Date().toISOString() : null}
    )
    on conflict (crm_deal_id) do update
    set
      client_name = coalesce(excluded.client_name, public.project_tracking_projects.client_name),
      company_name = coalesce(excluded.company_name, public.project_tracking_projects.company_name),
      client_email = coalesce(excluded.client_email, public.project_tracking_projects.client_email),
      client_email_normalized = coalesce(
        excluded.client_email_normalized,
        public.project_tracking_projects.client_email_normalized
      ),
      document_number = coalesce(excluded.document_number, public.project_tracking_projects.document_number),
      document_number_normalized = coalesce(excluded.document_number_normalized, public.project_tracking_projects.document_number_normalized),
      crm_pipeline = excluded.crm_pipeline,
      crm_stage = excluded.crm_stage,
      flow_type = excluded.flow_type,
      current_step_key = excluded.current_step_key,
      status = excluded.status,
      completed_at = case
        when excluded.status = 'completed' then coalesce(public.project_tracking_projects.completed_at, excluded.completed_at)
        else null
      end
    returning *
  `;

  if (isOpeningCompleted) {
    await sql`
      select public.complete_project_tracking_flow(
        ${upsertedProject.id as string},
        'company_opening',
        'crm',
        null
      )
    `;
    await sql`
      select public.sync_project_tracking_history(
        ${upsertedProject.id as string},
        'existing_company',
        ${targetStepKey},
        'crm',
        null
      )
    `;
  } else if (targetStatus === "completed") {
    await sql`
      select public.complete_project_tracking_flow(
        ${upsertedProject.id as string},
        ${targetFlowType},
        'crm',
        null
      )
    `;
  } else {
    await sql`
      select public.sync_project_tracking_history(
        ${upsertedProject.id as string},
        ${targetFlowType},
        ${targetStepKey},
        'crm',
        null
      )
    `;
  }

  const recipientName = companyName || clientName || "cliente";

  return json({
    ok: true,
    projectId: upsertedProject.id,
    trackingCode,
    flowType: targetFlowType,
    flowLabel: FLOW_LABELS[targetFlowType],
    status: targetStatus,
    currentStepKey: targetStepKey,
    autoTransitionedToExistingCompany: isOpeningCompleted,
    lookupUrl: `${publicAppUrl.replace(/\/$/, "")}/acompanhar`,
    customerMessage: buildTrackingMessage({
      name: recipientName,
      trackingCode,
      baseUrl: publicAppUrl,
    }),
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail("Metodo nao permitido.", 405);
  if (!isAuthorized(req)) return fail("Nao autorizado.", 401);

  try {
    const body = (await req.json().catch(() => ({}))) as UpdatePayload;
    return await createOrUpdateProject(body);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Erro inesperado ao atualizar o acompanhamento.";
    return fail(message, 500);
  }
});
