import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import postgres from "npm:postgres@3.4.5";

import {
  FLOW_LABELS,
  GENERIC_LOOKUP_ERROR,
  STATUS_LABELS,
  isDocumentValidationMode,
  sanitizeDocumentNumber,
  sanitizeTrackingCode,
} from "../_shared/project-tracking.ts";

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

type LookupPayload = {
  action?: unknown;
  trackingCode?: unknown;
  tracking_code?: unknown;
  documentNumber?: unknown;
  document_number?: unknown;
};

type StepStatus = "pending" | "current" | "completed";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fail = (message: string, status = 400) => json({ error: message }, status);

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

const lookupTracking = async (body: LookupPayload) => {
  const trackingCode = sanitizeTrackingCode(body.trackingCode ?? body.tracking_code);
  const documentNumber = sanitizeDocumentNumber(body.documentNumber ?? body.document_number);
  const documentValidationMode = await getDocumentValidationMode();

  if (!trackingCode) {
    return fail("Informe o codigo de acompanhamento.");
  }

  if (documentValidationMode === "required" && !documentNumber) {
    return fail("Informe o CPF ou CNPJ para continuar.");
  }

  const [project] = await sql`
    select
      id,
      client_name,
      company_name,
      tracking_code,
      document_number_normalized,
      flow_type,
      current_step_key,
      status,
      updated_at,
      completed_at
    from public.project_tracking_projects
    where tracking_code_normalized = ${trackingCode}
    limit 1
  `;

  if (!project) {
    return fail(GENERIC_LOOKUP_ERROR, 404);
  }

  const expectedDocument = (project.document_number_normalized as string | null) ?? "";
  if (documentNumber && expectedDocument && documentNumber !== expectedDocument) {
    return fail(GENERIC_LOOKUP_ERROR, 404);
  }

  if (documentValidationMode === "required" && expectedDocument && documentNumber !== expectedDocument) {
    return fail(GENERIC_LOOKUP_ERROR, 404);
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

  return json({
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
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail("Metodo nao permitido.", 405);

  try {
    const body = (await req.json().catch(() => ({}))) as LookupPayload;
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "lookup";

    if (action === "config") {
      return json({
        ok: true,
        documentValidationMode: await getDocumentValidationMode(),
      });
    }

    return await lookupTracking(body);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Erro inesperado ao consultar o acompanhamento.";
    return fail(message, 500);
  }
});
