import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.1";
import postgres from "npm:postgres@3.4.5";

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

type AppRole = "admin" | "gestor" | "consultor" | "visualizador";
type UserAccessStatus = "pending" | "active" | "suspended" | "inactive";
type ArchivedSelection = "active" | "archived" | "all";
type LeadEntityKind = "lead" | "customer_tracking";
type LeadEntitySelection = LeadEntityKind | "all";
type TrackingFlowKey = "opening_company" | "existing_company";

type LeadPayload = Record<string, unknown>;
type AdditionalContactPayload = {
  id: string;
  name: string;
  phone: string;
  email: string;
};

type LeadRow = Record<string, unknown> & {
  additional_contacts?: AdditionalContactPayload[] | null;
  created_by?: string | null;
  funnel_id?: string | null;
  next_follow_up?: Date | string | null;
  owner_id?: string | null;
  phone?: string | null;
  contact_name?: string | null;
  company_or_person?: string | null;
  stage_id?: string | null;
  entity_kind?: LeadEntityKind | null;
  tracking_flow_key?: TrackingFlowKey | null;
  source_lead_id?: string | null;
  tracking_code?: string | null;
};

const allowedLeadFields = new Set([
  "funnel_id",
  "company_or_person",
  "contact_name",
  "phone",
  "email",
  "employee_count",
  "employee_count_clt",
  "employee_count_pj",
  "cnpj",
  "source",
  "segment",
  "segment_other",
  "city",
  "uf",
  "company_maturity",
  "owner_id",
  "estimated_value",
  "temperature",
  "stage_id",
  "has_been_contacted",
  "contact_method",
  "next_follow_up",
  "loss_reason",
  "notes",
  "additional_contacts",
  "tax_regime",
  "monthly_revenue_managerial",
  "monthly_revenue_fiscal",
  "monthly_invoice_count",
  "payroll_gross_value",
  "bank_account_count",
  "bank_accounts_split",
  "financial_system",
  "accounting_pain_points",
  "service_types",
  "service_details",
  "position",
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fail = (message: string, status = 400) => json({ error: message }, status);

const cleanLeadPayload = (payload: LeadPayload = {}) => {
  const cleaned: LeadPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (allowedLeadFields.has(key) && value !== undefined) cleaned[key] = value;
  }
  return cleaned;
};

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const formatDateOnly = (value: Date | string | null | undefined) => {
  if (!value) return null;

  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;
  return normalized.slice(0, 10);
};

const formatDateTimeValue = (value: Date | string | null | undefined) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const normalized = normalizeOptionalString(value);
  return normalized ?? null;
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
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  ));
};

const normalizeAdditionalContacts = (value: unknown) => {
  if (!Array.isArray(value)) return [] as AdditionalContactPayload[];
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      return {
        id: typeof record.id === "string" && record.id ? record.id : `contact-${index + 1}`,
        name: normalizeOptionalString(record.name) ?? "",
        phone: normalizePhone(record.phone) ?? "",
        email: normalizeOptionalString(record.email) ?? "",
      };
    })
    .filter((item): item is AdditionalContactPayload => item !== null)
    .filter((item) => item.name || item.phone || item.email);
};

const prepareLeadPayload = (
  payload: LeadPayload,
  current?: LeadRow | null,
  options?: { enforcePrimaryContact?: boolean },
) => {
  const normalized = { ...payload };
  const enforcePrimaryContact = options?.enforcePrimaryContact ?? !current;

  if (Object.prototype.hasOwnProperty.call(normalized, "company_or_person")) {
    normalized.company_or_person = normalizeOptionalString(normalized.company_or_person);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "contact_name")) {
    normalized.contact_name = normalizeOptionalString(normalized.contact_name);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "phone")) {
    normalized.phone = normalizePhone(normalized.phone);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "email")) {
    normalized.email = normalizeOptionalString(normalized.email);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "employee_count")) {
    normalized.employee_count = normalizeOptionalString(normalized.employee_count);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "employee_count_clt")) {
    normalized.employee_count_clt = normalizeOptionalString(normalized.employee_count_clt);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "employee_count_pj")) {
    normalized.employee_count_pj = normalizeOptionalString(normalized.employee_count_pj);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "cnpj")) {
    normalized.cnpj = normalizeOptionalString(normalized.cnpj);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "source")) {
    normalized.source = normalizeOptionalString(normalized.source);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "segment")) {
    normalized.segment = normalizeOptionalString(normalized.segment);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "segment_other")) {
    normalized.segment_other = normalizeOptionalString(normalized.segment_other);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "city")) {
    normalized.city = normalizeOptionalString(normalized.city);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "uf")) {
    normalized.uf = normalizeOptionalString(normalized.uf);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "company_maturity")) {
    normalized.company_maturity = normalizeOptionalString(normalized.company_maturity);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "owner_id")) {
    normalized.owner_id = normalizeOptionalString(normalized.owner_id);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "funnel_id")) {
    normalized.funnel_id = normalizeOptionalString(normalized.funnel_id);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "contact_method")) {
    normalized.contact_method = normalizeOptionalString(normalized.contact_method);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "next_follow_up")) {
    normalized.next_follow_up = normalizeOptionalString(normalized.next_follow_up);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "notes")) {
    normalized.notes = normalizeOptionalString(normalized.notes);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "loss_reason")) {
    normalized.loss_reason = normalizeOptionalString(normalized.loss_reason);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "tax_regime")) {
    normalized.tax_regime = normalizeOptionalString(normalized.tax_regime);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "monthly_revenue_managerial")) {
    normalized.monthly_revenue_managerial = normalizeOptionalString(normalized.monthly_revenue_managerial);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "monthly_revenue_fiscal")) {
    normalized.monthly_revenue_fiscal = normalizeOptionalString(normalized.monthly_revenue_fiscal);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "monthly_invoice_count")) {
    normalized.monthly_invoice_count = normalizeOptionalString(normalized.monthly_invoice_count);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "payroll_gross_value")) {
    normalized.payroll_gross_value = normalizeOptionalString(normalized.payroll_gross_value);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "bank_account_count")) {
    normalized.bank_account_count = normalizeOptionalString(normalized.bank_account_count);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "bank_accounts_split")) {
    normalized.bank_accounts_split = normalizeOptionalString(normalized.bank_accounts_split);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "financial_system")) {
    normalized.financial_system = normalizeOptionalString(normalized.financial_system);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "accounting_pain_points")) {
    normalized.accounting_pain_points = normalizeOptionalString(normalized.accounting_pain_points);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "service_details")) {
    normalized.service_details = normalizeOptionalString(normalized.service_details);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "additional_contacts")) {
    normalized.additional_contacts = normalizeAdditionalContacts(normalized.additional_contacts);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "service_types")) {
    normalized.service_types = normalizeServiceTypes(normalized.service_types);
  }

  const company = (Object.prototype.hasOwnProperty.call(normalized, "company_or_person")
    ? normalized.company_or_person
    : current?.company_or_person) as string | null | undefined;
  const funnelId = (Object.prototype.hasOwnProperty.call(normalized, "funnel_id")
    ? normalized.funnel_id
    : current?.funnel_id) as string | null | undefined;
  const stageId = (Object.prototype.hasOwnProperty.call(normalized, "stage_id")
    ? normalized.stage_id
    : current?.stage_id) as string | null | undefined;
  const contactName = (Object.prototype.hasOwnProperty.call(normalized, "contact_name")
    ? normalized.contact_name
    : current?.contact_name) as string | null | undefined;
  const phone = (Object.prototype.hasOwnProperty.call(normalized, "phone")
    ? normalized.phone
    : current?.phone) as string | null | undefined;
  const segment = (Object.prototype.hasOwnProperty.call(normalized, "segment")
    ? normalized.segment
    : current?.segment) as string | null | undefined;

  if (!company) throw new Response("Empresa/pessoa e obrigatoria.", { status: 400 });
  if (!funnelId) throw new Response("Funil/negocio e obrigatorio.", { status: 400 });
  if (!stageId) throw new Response("Etapa do funil e obrigatoria.", { status: 400 });
  if (enforcePrimaryContact && !contactName) {
    throw new Response("Informe o nome do contato principal.", { status: 400 });
  }
  if (enforcePrimaryContact && countPhoneDigits(phone) < 10) {
    throw new Response("Informe um telefone valido para o contato principal.", { status: 400 });
  }

  if (segment !== "Outro") {
    normalized.segment_other = null;
  }

  return normalized;
};

const normalizeLead = (lead: LeadRow | null) => {
  if (!lead) return lead;
  return {
    ...lead,
    archived_at: formatDateTimeValue(lead.archived_at as Date | string | null | undefined),
    lost_at: formatDateTimeValue(lead.lost_at as Date | string | null | undefined),
    next_follow_up: formatDateOnly(lead.next_follow_up),
    won_at: formatDateTimeValue(lead.won_at as Date | string | null | undefined),
  };
};

const attachTrackingCodes = async (leads: LeadRow[]) => {
  const trackingLeadIds = Array.from(
    new Set(
      leads
        .filter((lead) => (lead.entity_kind ?? "lead") === "customer_tracking" && typeof lead.id === "string")
        .map((lead) => String(lead.id)),
    ),
  );

  if (trackingLeadIds.length === 0) return leads;

  const projectRows = await sql`
    select current_tracking_lead_id::text as lead_id, tracking_code
    from public.project_tracking_projects
    where current_tracking_lead_id = any(${trackingLeadIds})
  `;

  const trackingCodeByLeadId = new Map(
    projectRows.map((row) => [String(row.lead_id), (row.tracking_code as string | null) ?? null]),
  );

  return leads.map((lead) => (
    (lead.entity_kind ?? "lead") === "customer_tracking"
      ? { ...lead, tracking_code: trackingCodeByLeadId.get(String(lead.id)) ?? null }
      : lead
  ));
};

const attachTrackingCode = async (lead: LeadRow | null) => {
  if (!lead) return lead;
  const [nextLead] = await attachTrackingCodes([lead]);
  return nextLead ?? lead;
};

const roleFlags = (roles: AppRole[]) => {
  const has = (role: AppRole) => roles.includes(role);
  const isAdmin = has("admin");
  const isGestor = has("gestor");
  const isConsultor = has("consultor");
  const isVisualizador = has("visualizador");
  return {
    canReadAll: isAdmin || isGestor || isVisualizador,
    canManageAll: isAdmin || isGestor,
    canCreate: isAdmin || isGestor || isConsultor,
    isConsultor,
  };
};

type SessionContext = {
  userId: string;
  roles: AppRole[];
  hasAllFunnelAccess: boolean;
  accessibleFunnelIds: string[];
};

const userCanAccessFunnel = (ctx: SessionContext, funnelId: string | null | undefined) => {
  if (!funnelId) return false;
  return ctx.hasAllFunnelAccess || ctx.accessibleFunnelIds.includes(funnelId);
};

const canAccessLead = (lead: LeadRow, ctx: SessionContext) => {
  const flags = roleFlags(ctx.roles);
  if (!userCanAccessFunnel(ctx, lead.funnel_id)) return false;
  if (flags.canReadAll) return true;
  if (flags.isConsultor) return lead.owner_id === ctx.userId || lead.created_by === ctx.userId;
  return false;
};

const canEditLeadRecord = (lead: LeadRow, ctx: SessionContext) => {
  const flags = roleFlags(ctx.roles);
  if (!userCanAccessFunnel(ctx, lead.funnel_id)) return false;
  if (flags.canManageAll) return true;
  if (flags.isConsultor) return lead.owner_id === ctx.userId || lead.created_by === ctx.userId;
  return false;
};

const statusErrorMessage = (status: UserAccessStatus) => {
  switch (status) {
    case "pending":
      return "Seu acesso esta aguardando aprovacao.";
    case "suspended":
      return "Seu acesso esta suspenso.";
    case "inactive":
      return "Seu acesso esta inativo.";
    default:
      return "Sem permissao para acessar o sistema.";
  }
};

const getSessionContext = async (req: Request) => {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Response("Sessao nao encontrada.", { status: 401 });

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new Response("Sessao invalida ou expirada.", { status: 401 });

  const userId = data.user.id;
  const [profile] = await sql`
    select
      access_status::text as access_status,
      is_active,
      has_all_funnel_access
    from public.profiles
    where id = ${userId}
    limit 1
  `;

  const accessStatus = (profile?.access_status ?? "pending") as UserAccessStatus;
  if (accessStatus !== "active" || profile?.is_active === false) {
    throw new Response(statusErrorMessage(accessStatus), { status: 403 });
  }

  const roleRows = await sql`
    select role::text as role
    from public.user_roles
    where user_id = ${userId}
      and role in ('admin', 'gestor', 'consultor', 'visualizador')
  `;
  const roles = roleRows.map((row) => row.role as AppRole);
  if (!roles.length) {
    throw new Response("Seu acesso operacional ainda nao foi configurado.", { status: 403 });
  }

  const hasAllFunnelAccess = profile?.has_all_funnel_access !== false;
  const accessibleFunnelIds = hasAllFunnelAccess
    ? []
    : (await sql`
        select funnel_id::text as funnel_id
        from public.user_funnel_access
        where user_id = ${userId}
      `).map((row) => row.funnel_id as string);

  return { userId, roles, hasAllFunnelAccess, accessibleFunnelIds };
};

const assertFunnelAccess = (ctx: SessionContext, funnelId: string | null | undefined) => {
  if (!userCanAccessFunnel(ctx, funnelId)) {
    throw new Response("Sem permissao para acessar este funil.", { status: 403 });
  }
};

const assertAssignableOwner = async (ownerId: unknown, funnelId: string) => {
  if (!ownerId) return;
  const [owner] = await sql`
    select p.id
    from public.profiles p
    where p.id = ${ownerId as string}
      and p.access_status = 'active'
      and p.is_active = true
      and p.can_receive_leads = true
      and exists (
        select 1
        from public.user_roles ur
        where ur.user_id = p.id
          and ur.role in ('admin', 'gestor', 'consultor')
      )
      and public.user_has_funnel_access(p.id, ${funnelId})
    limit 1
  `;
  if (!owner) throw new Response("Responsavel invalido ou indisponivel.", { status: 400 });
};

const assertStageBelongsToFunnel = async (stageId: unknown, funnelId: unknown) => {
  if (!stageId || !funnelId) {
    throw new Response("Funil e etapa do funil sao obrigatorios.", { status: 400 });
  }

  const [stage] = await sql`
    select id
    from public.pipeline_stages
    where id = ${stageId as string}
      and funnel_id = ${funnelId as string}
    limit 1
  `;

  if (!stage) {
    throw new Response("A etapa selecionada nao pertence ao funil informado.", { status: 400 });
  }
};

const getOwnerName = async (ownerId: string | null) => {
  if (!ownerId) return "sem responsavel";
  const [owner] = await sql`
    select coalesce(full_name, email) as name
    from public.profiles
    where id = ${ownerId}
    limit 1
  `;
  return owner?.name || "sem responsavel";
};

const getStageName = async (stageId: string | null) => {
  if (!stageId) return "?";
  const [stage] = await sql`
    select name
    from public.pipeline_stages
    where id = ${stageId}
    limit 1
  `;
  return stage?.name || "?";
};

const getStageSnapshot = async (stageId: string | null | undefined) => {
  if (!stageId) return null;
  const [stage] = await sql`
    select id, funnel_id, name, position, is_won, is_lost
    from public.pipeline_stages
    where id = ${stageId}
    limit 1
  `;
  return stage ?? null;
};

const getFunnelSnapshot = async (funnelId: string | null | undefined) => {
  if (!funnelId) return null;
  const [funnel] = await sql`
    select id, name, module, tracking_flow_key, access_funnel_id
    from public.funnels
    where id = ${funnelId}
    limit 1
  `;
  return funnel ?? null;
};

const getFirstActiveStage = async (funnelId: string | null | undefined) => {
  if (!funnelId) return null;
  const [stage] = await sql`
    select id, funnel_id, name, position, is_won, is_lost
    from public.pipeline_stages
    where funnel_id = ${funnelId}
      and is_won = false
      and is_lost = false
    order by position asc, created_at asc
    limit 1
  `;
  return stage ?? null;
};

const getTrackingFunnel = async ({
  accessFunnelId,
  targetFlow,
}: {
  accessFunnelId: string;
  targetFlow: TrackingFlowKey;
}) => {
  const [funnel] = await sql`
    select id, name, module, tracking_flow_key, access_funnel_id
    from public.funnels
    where module = 'customer_tracking'
      and access_funnel_id = ${accessFunnelId}
      and tracking_flow_key = ${targetFlow}
    limit 1
  `;

  return funnel ?? null;
};

const parseArchivedSelection = (value: unknown): ArchivedSelection => {
  if (value === "archived" || value === "all") return value;
  return "active";
};

const parseLeadEntitySelection = (value: unknown): LeadEntitySelection => {
  if (value === "customer_tracking" || value === "all") return value;
  return "lead";
};

const normalizeTrackingFlowKey = (value: unknown): TrackingFlowKey | null => {
  if (value === "opening_company" || value === "existing_company") return value;
  return null;
};

const getTrackingFlowLabel = (flowKey: TrackingFlowKey) =>
  flowKey === "opening_company" ? "Abertura de empresa" : "Ja possui CNPJ";

const contactNotificationFields = [
  "company_or_person",
  "contact_name",
  "phone",
  "email",
  "source",
  "segment",
  "segment_other",
  "city",
  "uf",
  "additional_contacts",
] as const;

const getChangedFields = (current: LeadRow, updated: LeadRow, fields: readonly string[]) =>
  fields.filter((field) => JSON.stringify(current[field]) !== JSON.stringify(updated[field]));

const logActivity = async (
  leadId: string,
  type: string,
  description: string,
  userId: string,
  metadata: Record<string, unknown> | null = null,
) => {
  await sql`
    insert into public.lead_activities (lead_id, type, description, metadata, created_by, updated_by)
    values (${leadId}, ${type}, ${description}, ${metadata}, ${userId}, ${userId})
  `;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail("Metodo nao permitido.", 405);

  try {
    const session = await getSessionContext(req);
    const { userId, roles } = session;
    const flags = roleFlags(roles);
    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";
    const requestedFunnelId = normalizeOptionalString(body.funnel_id);
    const archivedSelection = parseArchivedSelection(body.archived);
    const entitySelection = parseLeadEntitySelection(body.entity_kind);

    if (action === "list") {
      if (requestedFunnelId) {
        assertFunnelAccess(session, requestedFunnelId);
      }

      const rows = flags.canReadAll
        ? archivedSelection === "archived"
          ? await sql`select * from public.leads order by archived_at desc nulls last, updated_at desc`
          : await sql`select * from public.leads order by position asc, created_at desc`
        : flags.isConsultor
          ? archivedSelection === "archived"
            ? await sql`
                select *
                from public.leads
                where owner_id = ${userId} or created_by = ${userId}
                order by archived_at desc nulls last, updated_at desc
              `
            : await sql`
                select *
                from public.leads
                where owner_id = ${userId} or created_by = ${userId}
                order by position asc, created_at desc
              `
          : [];
      const activeTrackingSourceLeadIds = new Set(
        rows
          .filter((lead) =>
            (lead.entity_kind ?? "lead") === "customer_tracking" &&
            !lead.is_archived &&
            typeof lead.source_lead_id === "string" &&
            lead.source_lead_id.length > 0,
          )
          .map((lead) => String(lead.source_lead_id)),
      );
      const filtered = rows.filter((lead) => {
        if (!canAccessLead(lead, session)) return false;
        if (requestedFunnelId && lead.funnel_id !== requestedFunnelId) return false;
        if (archivedSelection === "active" && lead.is_archived) return false;
        if (archivedSelection === "archived" && !lead.is_archived) return false;
        if (entitySelection !== "all" && (lead.entity_kind ?? "lead") !== entitySelection) return false;
        if (
          entitySelection === "lead" &&
          archivedSelection === "active" &&
          activeTrackingSourceLeadIds.has(String(lead.id))
        ) {
          return false;
        }
        return true;
      });
      const hydrated = await attachTrackingCodes(filtered as LeadRow[]);
      return json({ leads: hydrated.map(normalizeLead) });
    }

    if (action === "get") {
      const id = body.id as string | undefined;
      if (!id) return fail("Lead nao informado.");
      const [lead] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!lead) return fail("Lead nao encontrado.", 404);
      if (!canAccessLead(lead, session)) return fail("Acesso negado ao lead.", 403);
      const hydratedLead = await attachTrackingCode(lead as LeadRow);
      return json({ lead: normalizeLead(hydratedLead) });
    }

    if (action === "create") {
      if (!flags.canCreate) return fail("Sem permissao para criar leads.", 403);
      const lead = prepareLeadPayload(cleanLeadPayload(body.lead));
      assertFunnelAccess(session, lead.funnel_id as string | null | undefined);
      await assertStageBelongsToFunnel(lead.stage_id, lead.funnel_id);
      if (flags.isConsultor && !flags.canManageAll && lead.owner_id && lead.owner_id !== userId) {
        return fail("Consultores so podem criar leads proprios ou sem responsavel.", 403);
      }
      await assertAssignableOwner(lead.owner_id, lead.funnel_id as string);

      const [created] = await sql`
        insert into public.leads (
          funnel_id, company_or_person, contact_name, phone, email, employee_count, employee_count_clt, employee_count_pj,
          cnpj, source, segment, segment_other, city, uf, owner_id, estimated_value, temperature, stage_id,
          has_been_contacted, contact_method, next_follow_up, loss_reason, notes, additional_contacts, tax_regime,
          monthly_revenue_managerial, monthly_revenue_fiscal, monthly_invoice_count, payroll_gross_value,
          bank_account_count, bank_accounts_split, financial_system, accounting_pain_points, company_maturity, entity_kind,
          service_types, service_details, position, created_by, updated_by
        ) values (
          ${lead.funnel_id as string}, ${lead.company_or_person as string}, ${lead.contact_name ?? null}, ${lead.phone ?? null},
          ${lead.email ?? null}, ${lead.employee_count ?? null}, ${lead.employee_count_clt ?? null}, ${lead.employee_count_pj ?? null},
          ${lead.cnpj ?? null}, ${lead.source ?? null}, ${lead.segment ?? null}, ${lead.segment_other ?? null},
          ${lead.city ?? null}, ${lead.uf ?? null}, ${lead.owner_id ?? null}, ${lead.estimated_value ?? 0},
          ${lead.temperature ?? "morno"}, ${lead.stage_id as string}, ${lead.has_been_contacted ?? false},
          ${lead.contact_method ?? null}, ${lead.next_follow_up ?? null}, ${lead.loss_reason ?? null}, ${lead.notes ?? null},
          ${lead.additional_contacts ?? []}, ${lead.tax_regime ?? null}, ${lead.monthly_revenue_managerial ?? null},
          ${lead.monthly_revenue_fiscal ?? null}, ${lead.monthly_invoice_count ?? null}, ${lead.payroll_gross_value ?? null},
          ${lead.bank_account_count ?? null}, ${lead.bank_accounts_split ?? null}, ${lead.financial_system ?? null},
          ${lead.accounting_pain_points ?? null}, ${lead.company_maturity ?? null}, ${"lead"}, ${lead.service_types ?? []},
          ${lead.service_details ?? null},
          ${lead.position ?? 0}, ${userId}, ${userId}
        )
        returning *
      `;
      await logActivity(created.id, "lead_created", `Lead criado: ${created.company_or_person}`, userId);
      const hydratedLead = await attachTrackingCode(created as LeadRow);
      return json({ lead: normalizeLead(hydratedLead) }, 201);
    }

    if (action === "update") {
      const id = body.id as string | undefined;
      if (!id) return fail("Lead nao informado.");
      const [current] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!current) return fail("Lead nao encontrado.", 404);
      if (!canEditLeadRecord(current, session)) return fail("Sem permissao para alterar este lead.", 403);

      const rawUpdates = cleanLeadPayload(body.updates);
      const shouldEnforcePrimaryContact =
        Object.prototype.hasOwnProperty.call(rawUpdates, "contact_name") ||
        Object.prototype.hasOwnProperty.call(rawUpdates, "phone") ||
        Object.prototype.hasOwnProperty.call(rawUpdates, "email") ||
        Object.prototype.hasOwnProperty.call(rawUpdates, "company_or_person") ||
        Object.prototype.hasOwnProperty.call(rawUpdates, "segment") ||
        Object.prototype.hasOwnProperty.call(rawUpdates, "segment_other") ||
        Object.prototype.hasOwnProperty.call(rawUpdates, "tax_regime") ||
        Object.prototype.hasOwnProperty.call(rawUpdates, "service_types") ||
        Object.prototype.hasOwnProperty.call(rawUpdates, "service_details") ||
        Object.prototype.hasOwnProperty.call(rawUpdates, "additional_contacts");
      const updates = prepareLeadPayload(rawUpdates, current, {
        enforcePrimaryContact: shouldEnforcePrimaryContact,
      });
      const targetFunnelId = (updates.funnel_id ?? current.funnel_id) as string | null | undefined;
      assertFunnelAccess(session, targetFunnelId);
      await assertStageBelongsToFunnel(updates.stage_id ?? current.stage_id, targetFunnelId);
      if (Object.prototype.hasOwnProperty.call(updates, "owner_id")) {
        await assertAssignableOwner(updates.owner_id, targetFunnelId as string);
      }
      if (flags.isConsultor && !flags.canManageAll && updates.owner_id && updates.owner_id !== userId) {
        return fail("Consultores nao podem transferir leads para terceiros.", 403);
      }

      updates.updated_by = userId;
      const entries = Object.entries(updates);
      if (entries.length === 1) {
        const hydratedLead = await attachTrackingCode(current as LeadRow);
        return json({ lead: normalizeLead(hydratedLead) });
      }

      const values = entries.map(([, value]) => value);
      const setSql = entries.map(([key], index) => `"${key}" = $${index + 1}`).join(", ");
      const [updated] = await sql.unsafe(
        `update public.leads set ${setSql} where id = $${entries.length + 1} returning *`,
        [...values, id],
      );

      if (Object.prototype.hasOwnProperty.call(updates, "stage_id") && updated.stage_id !== current.stage_id) {
        const oldStage = await getStageName(current.stage_id);
        const newStage = await getStageName(updated.stage_id);
        const leadLabel = updated.company_or_person ?? updated.contact_name ?? "Lead";
        await logActivity(
          id,
          "stage_change",
          `${leadLabel}: etapa alterada de "${oldStage}" para "${newStage}"`,
          userId,
          { from: current.stage_id, to: updated.stage_id },
        );
      }

      if (Object.prototype.hasOwnProperty.call(updates, "owner_id") && updated.owner_id !== current.owner_id) {
        const oldOwner = await getOwnerName(current.owner_id);
        const newOwner = await getOwnerName(updated.owner_id);
        await logActivity(
          id,
          "owner_change",
          `Responsavel alterado de "${oldOwner}" para "${newOwner}"`,
          userId,
          { from: current.owner_id, to: updated.owner_id },
        );
      }

      const changedContactFields = getChangedFields(current, updated, contactNotificationFields);
      if (changedContactFields.length > 0) {
        await logActivity(
          id,
          "lead_updated",
          `Dados de contato atualizados em "${updated.company_or_person ?? updated.contact_name ?? "Lead"}"`,
          userId,
          { fields: changedContactFields },
        );
      }

      const hydratedLead = await attachTrackingCode(updated as LeadRow);
      return json({ lead: normalizeLead(hydratedLead) });
    }

    if (action === "create_tracking_from_lead") {
      const id = body.id as string | undefined;
      const targetFlow = normalizeTrackingFlowKey(body.target_flow);
      if (!id) return fail("Lead nao informado.");
      if (!targetFlow) return fail("Fluxo de acompanhamento invalido.");

      const [current] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!current) return fail("Lead nao encontrado.", 404);
      if (!canEditLeadRecord(current, session)) return fail("Sem permissao para acompanhar este cliente.", 403);
      if ((current.entity_kind ?? "lead") !== "lead") {
        return fail("Apenas leads comerciais podem iniciar um acompanhamento.", 400);
      }
      const currentStage = await getStageSnapshot(current.stage_id);
      if (!currentStage?.is_won) {
        return fail("O acompanhamento so pode ser iniciado para clientes ja finalizados no funil comercial.", 400);
      }

      const sourceFunnel = await getFunnelSnapshot(current.funnel_id);
      const accessFunnelId = sourceFunnel?.access_funnel_id ?? sourceFunnel?.id ?? null;
      if (!sourceFunnel || !accessFunnelId) {
        return fail("Nao foi possivel identificar o funil de origem deste lead.", 400);
      }

      const targetFunnel = await getTrackingFunnel({
        accessFunnelId,
        targetFlow,
      });
      if (!targetFunnel) {
        return fail("O fluxo de acompanhamento solicitado nao esta configurado.", 400);
      }

      assertFunnelAccess(session, targetFunnel.id);

      const [existingTrackingLead] = await sql`
        select *
        from public.leads
        where entity_kind = 'customer_tracking'
          and source_lead_id = ${current.id}
          and is_archived = false
        order by created_at desc
        limit 1
      `;

      if (existingTrackingLead) {
        if (existingTrackingLead.tracking_flow_key === targetFlow) {
          if (!current.is_archived) {
            await sql`
              update public.leads
              set is_archived = true,
                  archived_by = ${userId},
                  updated_by = ${userId}
              where id = ${current.id}
            `;

            await logActivity(
              current.id,
              "lead_updated",
              `Lead comercial removido do funil e vinculado ao acompanhamento "${existingTrackingLead.company_or_person ?? existingTrackingLead.contact_name ?? "Cliente"}".`,
              userId,
              {
                mode: "moved_to_tracking",
                tracking_lead_id: existingTrackingLead.id,
                target_funnel_id: existingTrackingLead.funnel_id,
              },
            );
          }

          const hydratedLead = await attachTrackingCode(existingTrackingLead as LeadRow);
          return json({ lead: normalizeLead(hydratedLead) });
        }

        return fail(
          `Este cliente ja esta em acompanhamento no fluxo "${getTrackingFlowLabel(existingTrackingLead.tracking_flow_key as TrackingFlowKey)}".`,
          400,
        );
      }

      const firstTrackingStage = await getFirstActiveStage(targetFunnel.id);
      if (!firstTrackingStage) {
        return fail("Nenhuma etapa ativa foi encontrada para o fluxo de acompanhamento.", 400);
      }

      const [createdTrackingLead] = await sql`
        insert into public.leads (
          funnel_id, company_or_person, contact_name, phone, email, employee_count, employee_count_clt, employee_count_pj,
          cnpj, source, segment, segment_other, city, uf, owner_id, estimated_value, temperature, stage_id,
          has_been_contacted, contact_method, next_follow_up, loss_reason, notes, additional_contacts, tax_regime,
          monthly_revenue_managerial, monthly_revenue_fiscal, monthly_invoice_count, payroll_gross_value,
          bank_account_count, bank_accounts_split, financial_system, accounting_pain_points, company_maturity,
          entity_kind, tracking_flow_key, source_lead_id, service_types, service_details, position, created_by, updated_by
        ) values (
          ${targetFunnel.id}, ${current.company_or_person}, ${current.contact_name}, ${current.phone}, ${current.email},
          ${current.employee_count}, ${current.employee_count_clt}, ${current.employee_count_pj}, ${current.cnpj},
          ${current.source}, ${current.segment}, ${current.segment_other}, ${current.city}, ${current.uf}, ${current.owner_id},
          ${current.estimated_value ?? 0}, ${current.temperature ?? "morno"}, ${firstTrackingStage.id},
          ${current.has_been_contacted ?? false}, ${current.contact_method ?? null}, ${current.next_follow_up ?? null},
          ${null}, ${current.notes ?? null}, ${current.additional_contacts ?? []}, ${current.tax_regime ?? null},
          ${current.monthly_revenue_managerial ?? null}, ${current.monthly_revenue_fiscal ?? null},
          ${current.monthly_invoice_count ?? null}, ${current.payroll_gross_value ?? null}, ${current.bank_account_count ?? null},
          ${current.bank_accounts_split ?? null}, ${current.financial_system ?? null}, ${current.accounting_pain_points ?? null},
          ${current.company_maturity ?? null}, ${"customer_tracking"}, ${targetFlow}, ${current.id},
          ${current.service_types ?? []}, ${current.service_details ?? null}, ${0}, ${userId}, ${userId}
        )
        returning *
      `;

      if (!current.is_archived) {
        await sql`
          update public.leads
          set is_archived = true,
              archived_by = ${userId},
              updated_by = ${userId}
          where id = ${current.id}
        `;
      }

      await logActivity(
        current.id,
        "lead_updated",
        `Cliente enviado para acompanhamento no fluxo "${targetFunnel.name}" e removido do funil comercial.`,
        userId,
        { tracking_lead_id: createdTrackingLead.id, target_funnel_id: targetFunnel.id },
      );

      await logActivity(
        createdTrackingLead.id,
        "lead_created",
        `Acompanhamento iniciado a partir do lead comercial "${current.company_or_person ?? current.contact_name ?? "Lead"}".`,
        userId,
        { source_lead_id: current.id, flow_key: targetFlow },
      );

      const hydratedLead = await attachTrackingCode(createdTrackingLead as LeadRow);
      return json({ lead: normalizeLead(hydratedLead) }, 201);
    }

    if (action === "transfer_tracking_flow") {
      const id = body.id as string | undefined;
      const targetFlow = normalizeTrackingFlowKey(body.target_flow);
      if (!id) return fail("Cliente em acompanhamento nao informado.");
      if (!targetFlow) return fail("Fluxo de destino invalido.");

      const [current] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!current) return fail("Cliente em acompanhamento nao encontrado.", 404);
      if (!canEditLeadRecord(current, session)) return fail("Sem permissao para transferir este acompanhamento.", 403);
      if ((current.entity_kind ?? "lead") !== "customer_tracking") {
        return fail("Apenas clientes em acompanhamento podem ser transferidos entre fluxos.", 400);
      }
      if (current.tracking_flow_key === targetFlow) {
        const hydratedLead = await attachTrackingCode(current as LeadRow);
        return json({ lead: normalizeLead(hydratedLead) });
      }

      const currentFunnel = await getFunnelSnapshot(current.funnel_id);
      const accessFunnelId = currentFunnel?.access_funnel_id ?? currentFunnel?.id ?? null;
      if (!currentFunnel || !accessFunnelId) {
        return fail("Nao foi possivel identificar o acesso base deste acompanhamento.", 400);
      }

      const targetFunnel = await getTrackingFunnel({
        accessFunnelId,
        targetFlow,
      });
      if (!targetFunnel) {
        return fail("O fluxo de destino nao esta configurado.", 400);
      }

      assertFunnelAccess(session, targetFunnel.id);

      const firstTrackingStage = await getFirstActiveStage(targetFunnel.id);
      if (!firstTrackingStage) {
        return fail("Nenhuma etapa ativa foi encontrada no fluxo de destino.", 400);
      }

      const [updatedTrackingLead] = await sql`
        update public.leads
        set funnel_id = ${targetFunnel.id},
            stage_id = ${firstTrackingStage.id},
            tracking_flow_key = ${targetFlow},
            is_archived = false,
            archived_at = null,
            archived_by = null,
            updated_by = ${userId}
        where id = ${id}
        returning *
      `;

      await logActivity(
        id,
        "stage_change",
        `Cliente transferido para o fluxo "${targetFunnel.name}" na etapa "${firstTrackingStage.name}".`,
        userId,
        {
          from_funnel_id: current.funnel_id,
          to_funnel_id: targetFunnel.id,
          from_flow_key: current.tracking_flow_key,
          to_flow_key: targetFlow,
          to_stage_id: firstTrackingStage.id,
        },
      );

      const hydratedLead = await attachTrackingCode(updatedTrackingLead as LeadRow);
      return json({ lead: normalizeLead(hydratedLead) });
    }

    if (action === "archive") {
      const id = body.id as string | undefined;
      if (!id) return fail("Lead nao informado.");

      const [current] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!current) return fail("Lead nao encontrado.", 404);
      if (!canEditLeadRecord(current, session)) return fail("Sem permissao para arquivar este lead.", 403);

      const currentStage = await getStageSnapshot(current.stage_id);
      const isTrackingLead = (current.entity_kind ?? "lead") === "customer_tracking";
      if (!isTrackingLead && !currentStage?.is_won && !currentStage?.is_lost) {
        return fail("Somente negocios perdidos ou clientes podem ser arquivados.", 400);
      }

      if (current.is_archived) {
        const hydratedLead = await attachTrackingCode(current as LeadRow);
        return json({ lead: normalizeLead(hydratedLead) });
      }

      const [archivedLead] = await sql`
        update public.leads
        set is_archived = true,
            archived_by = ${userId},
            updated_by = ${userId}
        where id = ${id}
        returning *
      `;

      await logActivity(
        id,
        "lead_updated",
        isTrackingLead
          ? "Cliente em acompanhamento arquivado manualmente."
          : currentStage?.is_lost
            ? "Negocio perdido arquivado manualmente."
            : "Negocio cliente arquivado manualmente.",
        userId,
        { mode: "manual_archive", stage_id: archivedLead.stage_id },
      );

      const hydratedLead = await attachTrackingCode(archivedLead as LeadRow);
      return json({ lead: normalizeLead(hydratedLead) });
    }

    if (action === "restore") {
      const id = body.id as string | undefined;
      if (!id) return fail("Lead nao informado.");

      const [current] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!current) return fail("Lead nao encontrado.", 404);
      if (!canEditLeadRecord(current, session)) return fail("Sem permissao para restaurar este lead.", 403);

      if (!current.is_archived) {
        const hydratedLead = await attachTrackingCode(current as LeadRow);
        return json({ lead: normalizeLead(hydratedLead) });
      }

      const [restoredLead] = await sql`
        update public.leads
        set is_archived = false,
            archived_by = null,
            updated_by = ${userId}
        where id = ${id}
        returning *
      `;

      await logActivity(
        id,
        "lead_updated",
        "Negocio restaurado para o funil principal.",
        userId,
        { mode: "restore_from_archive", stage_id: restoredLead.stage_id },
      );

      const hydratedLead = await attachTrackingCode(restoredLead as LeadRow);
      return json({ lead: normalizeLead(hydratedLead) });
    }

    if (action === "reopen") {
      const id = body.id as string | undefined;
      if (!id) return fail("Lead nao informado.");

      const [current] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!current) return fail("Lead nao encontrado.", 404);
      if (!canEditLeadRecord(current, session)) return fail("Sem permissao para reabrir este lead.", 403);

      const requestedStageId = normalizeOptionalString(body.target_stage_id);
      let targetStage = requestedStageId ? await getStageSnapshot(requestedStageId) : null;

      if (targetStage && targetStage.funnel_id !== current.funnel_id) {
        return fail("A etapa selecionada nao pertence ao mesmo funil deste lead.", 400);
      }

      if (targetStage && (targetStage.is_won || targetStage.is_lost)) {
        return fail("Selecione uma etapa ativa para reabrir este negocio.", 400);
      }

      if (!targetStage && current.last_active_stage_id) {
        const previousActiveStage = await getStageSnapshot(current.last_active_stage_id);
        if (previousActiveStage && !previousActiveStage.is_won && !previousActiveStage.is_lost) {
          targetStage = previousActiveStage;
        }
      }

      if (!targetStage) {
        targetStage = await getFirstActiveStage(current.funnel_id);
      }

      if (!targetStage) {
        return fail("Nao existe etapa ativa disponivel para reabrir este negocio.", 400);
      }

      const [reopenedLead] = await sql`
        update public.leads
        set stage_id = ${targetStage.id},
            is_archived = false,
            archived_by = null,
            updated_by = ${userId}
        where id = ${id}
        returning *
      `;

      await logActivity(
        id,
        "lead_updated",
        `Negocio reaberto na etapa "${targetStage.name}".`,
        userId,
        { mode: "reopen", stage_id: targetStage.id },
      );

      const hydratedLead = await attachTrackingCode(reopenedLead as LeadRow);
      return json({ lead: normalizeLead(hydratedLead) });
    }

    if (action === "delete") {
      if (!flags.canManageAll) return fail("Sem permissao para excluir leads.", 403);
      const id = body.id as string | undefined;
      if (!id) return fail("Lead nao informado.");
      const [lead] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!lead) return fail("Lead nao encontrado.", 404);
      if (!canAccessLead(lead, session)) return fail("Sem permissao para excluir este lead.", 403);
      if ((lead.entity_kind ?? "lead") === "lead") {
        await sql`
          delete from public.leads
          where entity_kind = 'customer_tracking'
            and source_lead_id = ${id}
        `;
      }
      await sql`delete from public.leads where id = ${id}`;
      return json({ ok: true });
    }

    return fail("Acao invalida.");
  } catch (error) {
    if (error instanceof Response) {
      const message = await error.text();
      return fail(message || "Erro no backend.", error.status || 500);
    }
    console.error(error);
    const message = error instanceof Error ? error.message : "Erro inesperado no backend.";
    return fail(message, 500);
  }
});
