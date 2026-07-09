import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.1";
import postgres from "npm:postgres@3.4.5";
import { sanitizeTrackingCode } from "../_shared/project-tracking.ts";
import { runNeocontadorFirstContactAutomation } from "../_shared/neocontador-first-contact.ts";

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
type ClientPortalInvitationStatus = "pending" | "accepted" | "expired" | "revoked";

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

type PortalInviteProjectCandidate = {
  id: string;
  current_tracking_lead_id: string | null;
  client_portal_user_id: string | null;
  client_name: string | null;
  company_name: string | null;
  flow_type: TrackingFlowKey;
  status: "active" | "completed" | "paused";
  updated_at: string;
  tracking_code: string;
  linked_full_name: string | null;
  linked_email: string | null;
};

const mapPortalInviteProjectCandidate = (row: Record<string, unknown>): PortalInviteProjectCandidate => ({
  id: row.id as string,
  current_tracking_lead_id: (row.current_tracking_lead_id as string | null) ?? null,
  client_portal_user_id: (row.client_portal_user_id as string | null) ?? null,
  client_name: (row.client_name as string | null) ?? null,
  company_name: (row.company_name as string | null) ?? null,
  flow_type: row.flow_type as TrackingFlowKey,
  status: row.status as "active" | "completed" | "paused",
  updated_at: row.updated_at as string,
  tracking_code: row.tracking_code as string,
  linked_full_name: (row.linked_full_name as string | null) ?? null,
  linked_email: (row.linked_email as string | null) ?? null,
});

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
  "contract_federal_regime",
  "contract_state_registration",
  "contract_monthly_fee",
  "contract_fiscal_code",
  "contract_accounting_code",
  "contract_labor_code",
  "contract_financial_codes",
  "contract_include_address",
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

const normalizeEmail = (value: unknown) => {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toLowerCase() : null;
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

const normalizeDocumentNumber = (value: unknown) => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, "");
  return digits || null;
};

const parsePositiveInteger = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallback;
};

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const sha256Hex = async (value: string) =>
  toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));

const generatePortalInviteToken = () =>
  `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;

const buildPortalInvitePath = (token: string) => `/cliente/ativar?token=${encodeURIComponent(token)}`;
const OWNER_EMAIL = "marketing@valleconsultores.com.br";

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

const normalizeContractFinancialCodes = (value: unknown) => {
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
  if (Object.prototype.hasOwnProperty.call(normalized, "contract_federal_regime")) {
    normalized.contract_federal_regime = normalizeOptionalString(normalized.contract_federal_regime);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "contract_state_registration")) {
    normalized.contract_state_registration = normalizeOptionalString(normalized.contract_state_registration);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "contract_monthly_fee")) {
    normalized.contract_monthly_fee = normalizeOptionalString(normalized.contract_monthly_fee);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "contract_fiscal_code")) {
    normalized.contract_fiscal_code = normalizeOptionalString(normalized.contract_fiscal_code);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "contract_accounting_code")) {
    normalized.contract_accounting_code = normalizeOptionalString(normalized.contract_accounting_code);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "contract_labor_code")) {
    normalized.contract_labor_code = normalizeOptionalString(normalized.contract_labor_code);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "contract_financial_codes")) {
    normalized.contract_financial_codes = normalizeContractFinancialCodes(normalized.contract_financial_codes);
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "contract_include_address")) {
    normalized.contract_include_address = normalized.contract_include_address === true;
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
    isAdmin,
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

const getClientPortalCandidateProjects = async (leadId: string): Promise<PortalInviteProjectCandidate[]> => {
  const [anchorProject] = await sql`
    select
      id::text as id,
      document_number_normalized,
      client_email_normalized,
      client_portal_user_id::text as client_portal_user_id
    from public.project_tracking_projects
    where current_tracking_lead_id = ${leadId}
    limit 1
  `;

  if (!anchorProject?.id) {
    throw new Response("Nenhum projeto de acompanhamento foi encontrado para este cliente.", { status: 404 });
  }

  const documentNumber = (anchorProject.document_number_normalized as string | null) ?? null;
  const email = (anchorProject.client_email_normalized as string | null) ?? null;
  const linkedUserId = (anchorProject.client_portal_user_id as string | null) ?? null;

  const rows = await sql`
    select distinct
      project.id::text as id,
      project.current_tracking_lead_id::text as current_tracking_lead_id,
      project.client_portal_user_id::text as client_portal_user_id,
      project.client_name,
      project.company_name,
      project.flow_type,
      project.status,
      project.created_at,
      project.updated_at,
      project.tracking_code,
      profile.full_name as linked_full_name,
      profile.email as linked_email
    from public.project_tracking_projects project
    left join public.profiles profile
      on profile.id = project.client_portal_user_id
    where project.id = ${anchorProject.id as string}
       or (${documentNumber}::text is not null and project.document_number_normalized = ${documentNumber}::text)
       or (${email}::text is not null and project.client_email_normalized = ${email}::text)
       or (${linkedUserId}::uuid is not null and project.client_portal_user_id = ${linkedUserId}::uuid)
    order by project.updated_at desc, project.created_at desc
  `;

  return rows.map((row) => mapPortalInviteProjectCandidate(row as Record<string, unknown>));
};

const getClientPortalProjectsByIds = async (projectIds: string[]): Promise<PortalInviteProjectCandidate[]> => {
  const uniqueIds = Array.from(new Set(projectIds.map((value) => value.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const rows = await sql`
    select
      project.id::text as id,
      project.current_tracking_lead_id::text as current_tracking_lead_id,
      project.client_portal_user_id::text as client_portal_user_id,
      project.client_name,
      project.company_name,
      project.flow_type,
      project.status,
      project.updated_at,
      project.tracking_code,
      profile.full_name as linked_full_name,
      profile.email as linked_email
    from public.project_tracking_projects project
    left join public.profiles profile
      on profile.id = project.client_portal_user_id
    where project.id::text = any(${uniqueIds}::text[])
    order by project.updated_at desc, project.created_at desc
  `;

  return rows.map((row) => mapPortalInviteProjectCandidate(row as Record<string, unknown>));
};

const getClientPortalProjectByTrackingCode = async (trackingCode: string): Promise<PortalInviteProjectCandidate | null> => {
  const normalizedTrackingCode = sanitizeTrackingCode(trackingCode);
  if (!normalizedTrackingCode) return null;

  const [project] = await sql`
    select
      project.id::text as id,
      project.current_tracking_lead_id::text as current_tracking_lead_id,
      project.client_portal_user_id::text as client_portal_user_id,
      project.client_name,
      project.company_name,
      project.flow_type,
      project.status,
      project.updated_at,
      project.tracking_code,
      profile.full_name as linked_full_name,
      profile.email as linked_email
    from public.project_tracking_projects project
    left join public.profiles profile
      on profile.id = project.client_portal_user_id
    where project.tracking_code_normalized = public.normalize_tracking_code(${normalizedTrackingCode})
    limit 1
  `;

  if (!project?.id) return null;
  return mapPortalInviteProjectCandidate(project as Record<string, unknown>);
};

const searchClientPortalAvailableProjects = async ({
  email,
  query,
}: {
  email: string | null;
  query: string | null;
}): Promise<PortalInviteProjectCandidate[]> => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedQuery = normalizeOptionalString(query);
  const searchPattern = normalizedQuery ? `%${normalizedQuery.replace(/\s+/g, "%")}%` : null;

  const rows = await sql`
    select
      project.id::text as id,
      project.current_tracking_lead_id::text as current_tracking_lead_id,
      project.client_portal_user_id::text as client_portal_user_id,
      project.client_name,
      project.company_name,
      project.flow_type,
      project.status,
      project.updated_at,
      project.tracking_code,
      profile.full_name as linked_full_name,
      profile.email as linked_email
    from public.project_tracking_projects project
    left join public.profiles profile
      on profile.id = project.client_portal_user_id
    where (
      project.client_portal_user_id is null
      or profile.email is null
      or (${normalizedEmail}::text is not null and lower(trim(profile.email)) = ${normalizedEmail}::text)
    )
      and (
        ${searchPattern}::text is null
        or project.tracking_code ilike ${searchPattern}::text
        or coalesce(project.company_name, '') ilike ${searchPattern}::text
        or coalesce(project.client_name, '') ilike ${searchPattern}::text
      )
    order by project.updated_at desc, project.created_at desc
    limit 40
  `;

  return rows.map((row) => mapPortalInviteProjectCandidate(row as Record<string, unknown>));
};

const buildInvitationProjectSummaries = (projects: PortalInviteProjectCandidate[]) =>
  projects.map((project) => ({
    id: project.id,
    currentTrackingLeadId: project.current_tracking_lead_id,
    clientPortalUserId: project.client_portal_user_id,
    clientName: project.client_name,
    companyName: project.company_name,
    displayName: project.company_name ?? project.client_name ?? "Projeto Valle",
    flowType: project.flow_type,
    flowLabel: getProjectFlowLabel(project.flow_type),
    status: project.status,
    statusLabel: getProjectStatusLabel(project.status),
    updatedAt: project.updated_at,
    trackingCode: project.tracking_code,
    linkedClientUser: project.client_portal_user_id
      ? {
        id: project.client_portal_user_id,
        full_name: project.linked_full_name,
        email: project.linked_email,
        access_status: "active",
        is_active: true,
      }
      : null,
  }));

const getLatestClientPortalInvitation = async (leadId: string) => {
  const [invitation] = await sql`
    select
      invitation.id::text as id,
      invitation.status,
      invitation.email,
      invitation.full_name,
      invitation.document_number,
      invitation.expires_at,
      invitation.accepted_at,
      invitation.last_sent_at,
      invitation.accepted_by_user_id::text as accepted_by_user_id,
      accepted_profile.full_name as accepted_by_full_name,
      accepted_profile.email as accepted_by_email
    from public.client_portal_invitations invitation
    left join public.profiles accepted_profile
      on accepted_profile.id = invitation.accepted_by_user_id
    where invitation.customer_tracking_lead_id = ${leadId}
    order by
      case when invitation.status = 'pending' then 0 else 1 end,
      invitation.created_at desc
    limit 1
  `;

  if (!invitation?.id) return null;

  const projectRows = await sql`
    select
      project.id::text as id,
      project.client_name,
      project.company_name,
      project.flow_type,
      project.status,
      project.updated_at,
      project.tracking_code
    from public.client_portal_invitation_projects invitation_project
    join public.project_tracking_projects project
      on project.id = invitation_project.project_id
    where invitation_project.invitation_id = ${invitation.id as string}
    order by project.updated_at desc, project.created_at desc
  `;

  return {
    id: invitation.id as string,
    status: invitation.status as ClientPortalInvitationStatus,
    email: invitation.email as string,
    fullName: (invitation.full_name as string | null) ?? null,
    documentNumber: (invitation.document_number as string | null) ?? null,
    expiresAt: invitation.expires_at as string,
    acceptedAt: (invitation.accepted_at as string | null) ?? null,
    lastSentAt: (invitation.last_sent_at as string | null) ?? null,
    projectIds: projectRows.map((row) => row.id as string),
    projects: projectRows.map((row) => ({
      id: row.id as string,
      displayName: (row.company_name as string | null) ?? (row.client_name as string | null) ?? "Projeto Valle",
      flowLabel: getProjectFlowLabel(row.flow_type as TrackingFlowKey),
      statusLabel: getProjectStatusLabel(row.status as "active" | "completed" | "paused"),
      trackingCode: row.tracking_code as string,
      updatedAt: row.updated_at as string,
    })),
    acceptedByUser: invitation.accepted_by_user_id
      ? {
        id: invitation.accepted_by_user_id as string,
        full_name: (invitation.accepted_by_full_name as string | null) ?? null,
        email: (invitation.accepted_by_email as string | null) ?? null,
        access_status: "active",
        is_active: true,
      }
      : null,
  };
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

const getProjectFlowLabel = (flowType: TrackingFlowKey) =>
  flowType === "opening_company" ? "Abertura da empresa" : "Implantacao do atendimento contabil";

const getProjectStatusLabel = (status: "active" | "completed" | "paused") => {
  switch (status) {
    case "completed":
      return "Concluido";
    case "paused":
      return "Pausado";
    default:
      return "Em andamento";
  }
};

const buildPortalInviteMessage = ({
  fullName,
  activationUrl,
  projects,
}: {
  fullName: string | null;
  activationUrl: string;
  projects: Array<{ displayName: string; flowLabel: string }>;
}) => {
  const opening = fullName ? `Ola, ${fullName}!` : "Ola!";
  const projectLines = projects.map((project) => `- ${project.displayName} (${project.flowLabel})`);

  return [
    opening,
    "",
    "Seu acesso ao Portal do Cliente da Valle foi liberado.",
    "",
    "Projetos incluidos neste convite:",
    ...projectLines,
    "",
    "Acesse o link abaixo para criar sua senha ou entrar na sua conta:",
    activationUrl,
    "",
    "Se precisar, nossa equipe pode reenviar o acesso.",
  ].join("\n");
};

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

    if (action === "list_client_users") {
      if (!flags.canManageAll) return fail("Sem permissao para gerenciar o portal do cliente.", 403);

      const users = await sql`
        select
          p.id::text as id,
          p.full_name,
          p.email,
          p.access_status::text as access_status,
          p.is_active
        from public.profiles p
        where exists (
          select 1
          from public.user_roles ur
          where ur.user_id = p.id
            and ur.role = 'cliente'
        )
        or not exists (
          select 1
          from public.user_roles ur
          where ur.user_id = p.id
            and ur.role in ('admin', 'gestor', 'consultor', 'visualizador')
        )
        order by coalesce(nullif(trim(p.full_name), ''), p.email) asc
      `;

      return json({ users });
    }

    if (action === "get_client_portal_link") {
      if (!flags.canManageAll) return fail("Sem permissao para gerenciar o portal do cliente.", 403);

      const id = body.id as string | undefined;
      if (!id) return fail("Cliente nao informado.");

      const [lead] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!lead) return fail("Cliente nao encontrado.", 404);
      if (!canAccessLead(lead, session)) return fail("Sem permissao para acessar este cliente.", 403);
      if ((lead.entity_kind ?? "lead") !== "customer_tracking") {
        return fail("Somente clientes em acompanhamento podem ser vinculados ao portal.", 400);
      }

      const [project] = await sql`
        select
          project.id::text as project_id,
          project.client_portal_user_id::text as client_portal_user_id,
          profile.full_name,
          profile.email,
          profile.access_status::text as access_status,
          profile.is_active
        from public.project_tracking_projects project
        left join public.profiles profile
          on profile.id = project.client_portal_user_id
        where project.current_tracking_lead_id = ${id}
        limit 1
      `;

      return json({
        project_id: (project?.project_id as string | null) ?? null,
        client_user: project?.client_portal_user_id
          ? {
            id: project.client_portal_user_id,
            full_name: (project.full_name as string | null) ?? null,
            email: (project.email as string | null) ?? null,
            access_status: (project.access_status as string | null) ?? null,
            is_active: project.is_active === true,
          }
          : null,
      });
    }

    if (action === "set_client_portal_link") {
      if (!flags.canManageAll) return fail("Sem permissao para gerenciar o portal do cliente.", 403);

      const id = body.id as string | undefined;
      const clientUserId = normalizeOptionalString(body.client_user_id);
      if (!id) return fail("Cliente nao informado.");

      const [lead] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!lead) return fail("Cliente nao encontrado.", 404);
      if (!canEditLeadRecord(lead, session)) return fail("Sem permissao para alterar este cliente.", 403);
      if ((lead.entity_kind ?? "lead") !== "customer_tracking") {
        return fail("Somente clientes em acompanhamento podem ser vinculados ao portal.", 400);
      }

      const [project] = await sql`
        select id::text as id
        from public.project_tracking_projects
        where current_tracking_lead_id = ${id}
        limit 1
      `;

      if (!project?.id) {
        return fail("Nenhum projeto de acompanhamento foi encontrado para este cliente.", 404);
      }

      if (clientUserId) {
        const [clientUser] = await sql`
          select
            p.id::text as id,
            p.full_name,
            p.email,
            p.access_status::text as access_status,
            p.is_active
          from public.profiles p
          where p.id = ${clientUserId}
            and not exists (
              select 1
              from public.user_roles ur
              where ur.user_id = p.id
                and ur.role in ('admin', 'gestor', 'consultor', 'visualizador')
            )
          limit 1
        `;

        if (!clientUser) {
          return fail("Usuario cliente nao encontrado.", 404);
        }

        await sql`
          insert into public.user_roles (user_id, role)
          values (${clientUserId}, 'cliente')
          on conflict (user_id, role) do nothing
        `;

        await sql`
          update public.profiles
          set access_status = 'active',
              is_active = true
          where id = ${clientUserId}
        `;

        await sql`
          update public.project_tracking_projects
          set client_portal_user_id = ${clientUserId}
            , portal_claimed_at = coalesce(portal_claimed_at, now())
            , portal_claim_source = 'manual'
          where id = ${project.id as string}
        `;

        return json({
          project_id: project.id,
          client_user: {
            id: clientUser.id,
            full_name: (clientUser.full_name as string | null) ?? null,
            email: (clientUser.email as string | null) ?? null,
            access_status: "active",
            is_active: true,
          },
        });
      }

      await sql`
        update public.project_tracking_projects
        set client_portal_user_id = null
          , portal_claimed_at = null
          , portal_claim_source = null
        where id = ${project.id as string}
      `;

      return json({
        project_id: project.id,
        client_user: null,
      });
    }

    if (action === "get_client_portal_invitation_setup") {
      if (!flags.canManageAll) return fail("Sem permissao para gerenciar convites do portal do cliente.", 403);

      const id = body.id as string | undefined;
      if (!id) return fail("Cliente nao informado.");

      const [lead] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!lead) return fail("Cliente nao encontrado.", 404);
      if (!canAccessLead(lead, session)) return fail("Sem permissao para acessar este cliente.", 403);
      if ((lead.entity_kind ?? "lead") !== "customer_tracking") {
        return fail("Somente clientes em acompanhamento podem receber convite do portal.", 400);
      }

      const candidateProjects = await getClientPortalCandidateProjects(id);
      const invitation = await getLatestClientPortalInvitation(id);
      const selectedProjects = invitation?.projectIds?.length
        ? await getClientPortalProjectsByIds(invitation.projectIds)
        : [];
      const projectMap = new Map<string, PortalInviteProjectCandidate>();

      for (const project of [...candidateProjects, ...selectedProjects]) {
        projectMap.set(project.id, project);
      }

      return json({
        lead: {
          id,
          full_name: (lead.contact_name as string | null) ?? (lead.company_or_person as string | null) ?? null,
          email: (lead.email as string | null) ?? null,
          document_number: (lead.cnpj as string | null) ?? null,
        },
        projects: buildInvitationProjectSummaries(Array.from(projectMap.values())),
        invitation,
      });
    }

    if (action === "find_client_portal_invitation_project") {
      if (!flags.canManageAll) return fail("Sem permissao para gerenciar convites do portal do cliente.", 403);

      const id = body.id as string | undefined;
      const trackingCode = sanitizeTrackingCode(body.tracking_code);

      if (!id) return fail("Cliente nao informado.");
      if (!trackingCode) return fail("Informe o codigo do projeto.");

      const [lead] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!lead) return fail("Cliente nao encontrado.", 404);
      if (!canEditLeadRecord(lead, session)) return fail("Sem permissao para alterar este cliente.", 403);
      if ((lead.entity_kind ?? "lead") !== "customer_tracking") {
        return fail("Somente clientes em acompanhamento podem receber convite do portal.", 400);
      }

      const project = await getClientPortalProjectByTrackingCode(trackingCode);
      if (!project) return fail("Nao encontramos um projeto com esse codigo.", 404);

      return json({
        ok: true,
        project: buildInvitationProjectSummaries([project])[0],
      });
    }

    if (action === "search_client_portal_invitation_projects") {
      if (!flags.canManageAll) return fail("Sem permissao para gerenciar convites do portal do cliente.", 403);

      const id = body.id as string | undefined;
      const searchQuery = normalizeOptionalString(body.query);
      const email = normalizeOptionalString(body.email);

      if (!id) return fail("Cliente nao informado.");

      const [lead] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!lead) return fail("Cliente nao encontrado.", 404);
      if (!canAccessLead(lead, session)) return fail("Sem permissao para acessar este cliente.", 403);
      if ((lead.entity_kind ?? "lead") !== "customer_tracking") {
        return fail("Somente clientes em acompanhamento podem receber convite do portal.", 400);
      }

      const projects = await searchClientPortalAvailableProjects({
        email,
        query: searchQuery,
      });

      return json({
        ok: true,
        projects: buildInvitationProjectSummaries(projects),
      });
    }

    if (action === "upsert_client_portal_invitation") {
      if (!flags.canManageAll) return fail("Sem permissao para gerenciar convites do portal do cliente.", 403);

      const id = body.id as string | undefined;
      const email = normalizeOptionalString(body.email);
      const emailNormalized = normalizeEmail(body.email);
      const fullName = normalizeOptionalString(body.full_name);
      const documentNumber = normalizeOptionalString(body.document_number);
      const documentNumberNormalized = normalizeDocumentNumber(body.document_number);
      const expiresInDays = Math.min(parsePositiveInteger(body.expires_in_days, 7), 30);
      const projectIds = Array.isArray(body.project_ids)
        ? Array.from(new Set(
            body.project_ids
              .filter((item): item is string => typeof item === "string")
              .map((item) => item.trim())
              .filter(Boolean),
          ))
        : [];

      if (!id) return fail("Cliente nao informado.");
      if (!email || !emailNormalized) return fail("Informe o e-mail do convite.");
      if (projectIds.length === 0) return fail("Selecione ao menos um projeto para o convite.");

      const [lead] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!lead) return fail("Cliente nao encontrado.", 404);
      if (!canEditLeadRecord(lead, session)) return fail("Sem permissao para alterar este cliente.", 403);
      if ((lead.entity_kind ?? "lead") !== "customer_tracking") {
        return fail("Somente clientes em acompanhamento podem receber convite do portal.", 400);
      }

      const candidateProjects = await getClientPortalCandidateProjects(id);
      const selectedProjects = await getClientPortalProjectsByIds(projectIds);
      const candidateMap = new Map(
        [...candidateProjects, ...selectedProjects].map((project) => [project.id, project] as const),
      );

      for (const projectId of projectIds) {
        const project = candidateMap.get(projectId);
        if (!project) {
          return fail("Um dos projetos selecionados nao esta disponivel para este convite.", 400);
        }

        const linkedEmail = normalizeEmail(project.linked_email);
        if (
          project.client_portal_user_id &&
          linkedEmail &&
          linkedEmail !== emailNormalized
        ) {
          return fail(
            `O projeto "${project.company_name ?? project.client_name ?? "Projeto Valle"}" ja esta vinculado a outra conta do portal.`,
            409,
          );
        }
      }

      const rawToken = generatePortalInviteToken();
      const tokenHash = await sha256Hex(rawToken);

      const [pendingInvitation] = await sql`
        select id::text as id
        from public.client_portal_invitations
        where customer_tracking_lead_id = ${id}
          and status = 'pending'
        limit 1
      `;

      let invitationId = pendingInvitation?.id as string | undefined;

      if (invitationId) {
        await sql`
          update public.client_portal_invitations
          set
            token_hash = ${tokenHash},
            email = ${email},
            email_normalized = ${emailNormalized},
            full_name = ${fullName},
            document_number = ${documentNumber},
            document_number_normalized = ${documentNumberNormalized},
            expires_at = now() + (${expiresInDays}::text || ' days')::interval,
            last_sent_at = now(),
            accepted_at = null,
            accepted_by_user_id = null,
            revoked_by = null,
            status = 'pending'
          where id = ${invitationId}
        `;

        await sql`
          delete from public.client_portal_invitation_projects
          where invitation_id = ${invitationId}
        `;
      } else {
        const [createdInvitation] = await sql`
          insert into public.client_portal_invitations (
            customer_tracking_lead_id,
            token_hash,
            email,
            email_normalized,
            full_name,
            document_number,
            document_number_normalized,
            status,
            expires_at,
            created_by,
            last_sent_at
          ) values (
            ${id},
            ${tokenHash},
            ${email},
            ${emailNormalized},
            ${fullName},
            ${documentNumber},
            ${documentNumberNormalized},
            'pending',
            now() + (${expiresInDays}::text || ' days')::interval,
            ${userId},
            now()
          )
          returning id::text as id
        `;

        invitationId = createdInvitation?.id as string | undefined;
      }

      if (!invitationId) {
        throw new Error("Nao foi possivel gerar o convite do portal.");
      }

      for (const projectId of projectIds) {
        await sql`
          insert into public.client_portal_invitation_projects (invitation_id, project_id)
          values (${invitationId}, ${projectId})
          on conflict (invitation_id, project_id) do nothing
        `;
      }

      const invitation = await getLatestClientPortalInvitation(id);
      const selectedProjectSummaries = Array.from(
        new Map(
          selectedProjects
            .filter((project) => projectIds.includes(project.id))
            .map((project) => [project.id, project] as const),
        ).values(),
      );
      const activationPath = buildPortalInvitePath(rawToken);
      const activationUrl = activationPath;
      const message = buildPortalInviteMessage({
        fullName,
        activationUrl,
        projects: selectedProjectSummaries.map((project) => ({
          displayName: project.company_name ?? project.client_name ?? "Projeto Valle",
          flowLabel: getProjectFlowLabel(project.flow_type),
        })),
      });

      return json({
        ok: true,
        invitation,
        activation_path: activationPath,
        message,
      });
    }

    if (action === "revoke_client_portal_invitation") {
      if (!flags.canManageAll) return fail("Sem permissao para gerenciar convites do portal do cliente.", 403);

      const invitationId = body.invitation_id as string | undefined;
      if (!invitationId) return fail("Convite nao informado.");

      const [invitation] = await sql`
        select
          invitation.id::text as id,
          invitation.customer_tracking_lead_id::text as customer_tracking_lead_id
        from public.client_portal_invitations invitation
        join public.leads lead on lead.id = invitation.customer_tracking_lead_id
        where invitation.id = ${invitationId}
        limit 1
      `;

      if (!invitation?.id) return fail("Convite nao encontrado.", 404);

      const [lead] = await sql`select * from public.leads where id = ${invitation.customer_tracking_lead_id as string} limit 1`;
      if (!lead) return fail("Cliente nao encontrado.", 404);
      if (!canEditLeadRecord(lead, session)) return fail("Sem permissao para alterar este cliente.", 403);

      await sql`
        update public.client_portal_invitations
        set status = 'revoked',
            revoked_by = ${userId}
        where id = ${invitationId}
      `;

      return json({ ok: true });
    }

    if (action === "create") {
      if (!flags.canCreate) return fail("Sem permissao para criar leads.", 403);
      const lead = prepareLeadPayload(cleanLeadPayload(body.lead));
      assertFunnelAccess(session, lead.funnel_id as string | null | undefined);
      await assertStageBelongsToFunnel(lead.stage_id, lead.funnel_id);
      const targetFunnel = await getFunnelSnapshot(lead.funnel_id as string | null | undefined);
      if (!targetFunnel) {
        return fail("Funil informado nao encontrado.", 400);
      }
      const entityKind: LeadEntityKind = targetFunnel.module === "customer_tracking" ? "customer_tracking" : "lead";
      const trackingFlowKey = entityKind === "customer_tracking"
        ? normalizeTrackingFlowKey(targetFunnel.tracking_flow_key)
        : null;
      // Manual customer-tracking records do not come from a commercial lead.
      // We self-reference the row to satisfy the FK/check constraint pair.
      const createdLeadId = crypto.randomUUID();
      const sourceLeadId = entityKind === "customer_tracking" ? createdLeadId : null;
      if (entityKind === "customer_tracking" && !trackingFlowKey) {
        return fail("O fluxo de acompanhamento selecionado nao esta configurado.", 400);
      }
      if (flags.isConsultor && !flags.canManageAll && lead.owner_id && lead.owner_id !== userId) {
        return fail("Consultores so podem criar leads proprios ou sem responsavel.", 403);
      }
      await assertAssignableOwner(lead.owner_id, lead.funnel_id as string);

      const [created] = await sql`
        insert into public.leads (
          id, funnel_id, company_or_person, contact_name, phone, email, employee_count, employee_count_clt, employee_count_pj,
          cnpj, source, segment, segment_other, city, uf, contract_federal_regime, contract_state_registration,
          contract_monthly_fee, contract_fiscal_code, contract_accounting_code, contract_labor_code,
          contract_financial_codes, contract_include_address, owner_id, estimated_value, temperature, stage_id,
          has_been_contacted, contact_method, next_follow_up, loss_reason, notes, additional_contacts, tax_regime,
          monthly_revenue_managerial, monthly_revenue_fiscal, monthly_invoice_count, payroll_gross_value,
          bank_account_count, bank_accounts_split, financial_system, accounting_pain_points, company_maturity, entity_kind,
          tracking_flow_key, source_lead_id, service_types, service_details, position, created_by, updated_by
        ) values (
          ${createdLeadId}, ${lead.funnel_id as string}, ${lead.company_or_person as string}, ${lead.contact_name ?? null}, ${lead.phone ?? null},
          ${lead.email ?? null}, ${lead.employee_count ?? null}, ${lead.employee_count_clt ?? null}, ${lead.employee_count_pj ?? null},
          ${lead.cnpj ?? null}, ${lead.source ?? null}, ${lead.segment ?? null}, ${lead.segment_other ?? null}, ${lead.city ?? null},
          ${lead.uf ?? null}, ${lead.contract_federal_regime ?? null}, ${lead.contract_state_registration ?? null},
          ${lead.contract_monthly_fee ?? null}, ${lead.contract_fiscal_code ?? null}, ${lead.contract_accounting_code ?? null},
          ${lead.contract_labor_code ?? null}, ${lead.contract_financial_codes ?? []}, ${lead.contract_include_address ?? false},
          ${lead.owner_id ?? null}, ${lead.estimated_value ?? 0}, ${lead.temperature ?? "morno"}, ${lead.stage_id as string}, ${lead.has_been_contacted ?? false},
          ${lead.contact_method ?? null}, ${lead.next_follow_up ?? null}, ${lead.loss_reason ?? null}, ${lead.notes ?? null},
          ${lead.additional_contacts ?? []}, ${lead.tax_regime ?? null}, ${lead.monthly_revenue_managerial ?? null},
          ${lead.monthly_revenue_fiscal ?? null}, ${lead.monthly_invoice_count ?? null}, ${lead.payroll_gross_value ?? null},
          ${lead.bank_account_count ?? null}, ${lead.bank_accounts_split ?? null}, ${lead.financial_system ?? null},
          ${lead.accounting_pain_points ?? null}, ${lead.company_maturity ?? null}, ${entityKind},
          ${trackingFlowKey}, ${sourceLeadId}, ${lead.service_types ?? []}, ${lead.service_details ?? null},
          ${lead.position ?? 0}, ${userId}, ${userId}
        )
        returning *
      `;
      await logActivity(
        created.id,
        "lead_created",
        entityKind === "customer_tracking"
          ? `Cliente em acompanhamento criado: ${created.company_or_person}`
          : `Lead criado: ${created.company_or_person}`,
        userId,
        entityKind === "customer_tracking" ? { flow_key: trackingFlowKey } : null,
      );
      await runNeocontadorFirstContactAutomation({
        sql,
        leadId: created.id as string,
        actorUserId: userId,
      });

      const [latestCreated] = await sql`select * from public.leads where id = ${created.id} limit 1`;
      const hydratedLead = await attachTrackingCode((latestCreated ?? created) as LeadRow);
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
          cnpj, source, segment, segment_other, city, uf, contract_federal_regime, contract_state_registration,
          contract_monthly_fee, contract_fiscal_code, contract_accounting_code, contract_labor_code,
          contract_financial_codes, contract_include_address, owner_id, estimated_value, temperature, stage_id,
          has_been_contacted, contact_method, next_follow_up, loss_reason, notes, additional_contacts, tax_regime,
          monthly_revenue_managerial, monthly_revenue_fiscal, monthly_invoice_count, payroll_gross_value,
          bank_account_count, bank_accounts_split, financial_system, accounting_pain_points, company_maturity,
          entity_kind, tracking_flow_key, source_lead_id, service_types, service_details, position, created_by, updated_by
        ) values (
          ${targetFunnel.id}, ${current.company_or_person}, ${current.contact_name}, ${current.phone}, ${current.email},
          ${current.employee_count}, ${current.employee_count_clt}, ${current.employee_count_pj}, ${current.cnpj},
          ${current.source}, ${current.segment}, ${current.segment_other}, ${current.city}, ${current.uf},
          ${current.contract_federal_regime ?? null}, ${current.contract_state_registration ?? null},
          ${current.contract_monthly_fee ?? null}, ${current.contract_fiscal_code ?? null},
          ${current.contract_accounting_code ?? null}, ${current.contract_labor_code ?? null},
          ${current.contract_financial_codes ?? []}, ${current.contract_include_address ?? false}, ${current.owner_id},
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

    if (action === "delete_crm_user") {
      if (!flags.isAdmin) return fail("Somente administradores podem excluir contas do CRM.", 403);

      const targetUserId = normalizeOptionalString(body.user_id);
      if (!targetUserId) return fail("Usuario nao informado.");
      if (targetUserId === userId) return fail("Nao e permitido excluir a propria conta por este fluxo.", 400);

      const [targetProfile] = await sql`
        select
          p.id::text as id,
          p.email,
          p.full_name
        from public.profiles p
        where p.id = ${targetUserId}
        limit 1
      `;

      if (!targetProfile?.id) return fail("Usuario nao encontrado.", 404);

      const normalizedTargetEmail = normalizeEmail(targetProfile.email);
      if (normalizedTargetEmail === OWNER_EMAIL) {
        return fail("A conta principal protegida nao pode ser excluida.", 403);
      }

      const [ownedLeadSummary] = await sql`
        select count(*)::int as total
        from public.leads
        where owner_id = ${targetUserId}
          and is_archived = false
      `;

      const ownedLeadCount = Number(ownedLeadSummary?.total ?? 0);
      if (ownedLeadCount > 0) {
        return fail(
          `Essa conta ainda esta responsavel por ${ownedLeadCount} lead(s)/cliente(s) ativo(s). Reatribua antes de excluir.`,
          409,
        );
      }

      const deleteAuthResult = await authClient.auth.admin.deleteUser(targetUserId);
      if (deleteAuthResult.error) {
        throw new Error(deleteAuthResult.error.message);
      }

      await sql.begin(async (tx) => {
        await tx`delete from public.user_notifications where recipient_user_id = ${targetUserId}`;
        await tx`delete from public.user_funnel_access where user_id = ${targetUserId}`;
        await tx`delete from public.user_roles where user_id = ${targetUserId}`;
        await tx`
          update public.project_tracking_projects
          set client_portal_user_id = null,
              portal_claimed_at = null,
              portal_claim_source = null
          where client_portal_user_id = ${targetUserId}
        `;
        await tx`delete from public.profiles where id = ${targetUserId}`;
      });

      return json({
        ok: true,
        deleted_user_id: targetUserId,
      });
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
