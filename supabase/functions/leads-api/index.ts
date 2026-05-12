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
    next_follow_up: formatDateOnly(lead.next_follow_up),
  };
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

    if (action === "list") {
      if (requestedFunnelId) {
        assertFunnelAccess(session, requestedFunnelId);
      }

      const rows = flags.canReadAll
        ? await sql`select * from public.leads order by position asc, created_at desc`
        : flags.isConsultor
          ? await sql`
              select *
              from public.leads
              where owner_id = ${userId} or created_by = ${userId}
              order by position asc, created_at desc
            `
          : [];
      const filtered = rows.filter((lead) => {
        if (!canAccessLead(lead, session)) return false;
        if (requestedFunnelId && lead.funnel_id !== requestedFunnelId) return false;
        return true;
      });
      return json({ leads: filtered.map(normalizeLead) });
    }

    if (action === "get") {
      const id = body.id as string | undefined;
      if (!id) return fail("Lead nao informado.");
      const [lead] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!lead) return fail("Lead nao encontrado.", 404);
      if (!canAccessLead(lead, session)) return fail("Acesso negado ao lead.", 403);
      return json({ lead: normalizeLead(lead) });
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
          bank_account_count, bank_accounts_split, financial_system, accounting_pain_points, company_maturity,
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
          ${lead.accounting_pain_points ?? null}, ${lead.company_maturity ?? null}, ${lead.service_types ?? []},
          ${lead.service_details ?? null},
          ${lead.position ?? 0}, ${userId}, ${userId}
        )
        returning *
      `;
      await logActivity(created.id, "lead_created", `Lead criado: ${created.company_or_person}`, userId);
      return json({ lead: normalizeLead(created) }, 201);
    }

    if (action === "update") {
      const id = body.id as string | undefined;
      if (!id) return fail("Lead nao informado.");
      const [current] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!current) return fail("Lead nao encontrado.", 404);
      if (!canAccessLead(current, session)) return fail("Sem permissao para alterar este lead.", 403);

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
      if (entries.length === 1) return json({ lead: current });

      const values = entries.map(([, value]) => value);
      const setSql = entries.map(([key], index) => `"${key}" = $${index + 1}`).join(", ");
      const [updated] = await sql.unsafe(
        `update public.leads set ${setSql} where id = $${entries.length + 1} returning *`,
        [...values, id],
      );

      if (Object.prototype.hasOwnProperty.call(updates, "stage_id") && updated.stage_id !== current.stage_id) {
        const oldStage = await getStageName(current.stage_id);
        const newStage = await getStageName(updated.stage_id);
        await logActivity(
          id,
          "stage_change",
          `Etapa alterada de "${oldStage}" para "${newStage}"`,
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

      return json({ lead: normalizeLead(updated) });
    }

    if (action === "delete") {
      if (!flags.canManageAll) return fail("Sem permissao para excluir leads.", 403);
      const id = body.id as string | undefined;
      if (!id) return fail("Lead nao informado.");
      const [lead] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!lead) return fail("Lead nao encontrado.", 404);
      if (!canAccessLead(lead, session)) return fail("Sem permissao para excluir este lead.", 403);
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
