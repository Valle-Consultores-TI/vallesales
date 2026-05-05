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
type LeadRow = Record<string, unknown> & {
  created_by?: string | null;
  next_follow_up?: Date | string | null;
  owner_id?: string | null;
};

const allowedLeadFields = new Set([
  "company_or_person",
  "contact_name",
  "phone",
  "email",
  "source",
  "segment",
  "city",
  "uf",
  "owner_id",
  "estimated_value",
  "temperature",
  "stage_id",
  "has_been_contacted",
  "contact_method",
  "next_follow_up",
  "notes",
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

const normalizeLead = (lead: LeadRow | null) => {
  if (!lead) return lead;
  const followUp = lead.next_follow_up;
  return {
    ...lead,
    next_follow_up: followUp instanceof Date
      ? followUp.toISOString().slice(0, 10)
      : followUp
        ? String(followUp).slice(0, 10)
        : null,
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

const canAccessLead = (lead: LeadRow, userId: string, roles: AppRole[]) => {
  const flags = roleFlags(roles);
  if (flags.canReadAll) return true;
  if (flags.isConsultor) return lead.owner_id === userId || lead.created_by === userId;
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
      is_active
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

  return { userId, roles };
};

const assertAssignableOwner = async (ownerId: unknown) => {
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
    limit 1
  `;
  if (!owner) throw new Response("Responsavel invalido ou indisponivel.", { status: 400 });
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
    const { userId, roles } = await getSessionContext(req);
    const flags = roleFlags(roles);
    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";

    if (action === "list") {
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
      return json({ leads: rows.map(normalizeLead) });
    }

    if (action === "get") {
      const id = body.id as string | undefined;
      if (!id) return fail("Lead nao informado.");
      const [lead] = await sql`select * from public.leads where id = ${id} limit 1`;
      if (!lead) return fail("Lead nao encontrado.", 404);
      if (!canAccessLead(lead, userId, roles)) return fail("Acesso negado ao lead.", 403);
      return json({ lead: normalizeLead(lead) });
    }

    if (action === "create") {
      if (!flags.canCreate) return fail("Sem permissao para criar leads.", 403);
      const lead = cleanLeadPayload(body.lead);
      if (!lead.company_or_person || !lead.stage_id) {
        return fail("Empresa/pessoa e etapa sao obrigatorios.");
      }
      if (flags.isConsultor && !flags.canManageAll && lead.owner_id && lead.owner_id !== userId) {
        return fail("Consultores so podem criar leads proprios ou sem responsavel.", 403);
      }
      await assertAssignableOwner(lead.owner_id);

      const [created] = await sql`
        insert into public.leads (
          company_or_person, contact_name, phone, email, source, segment, city, uf,
          owner_id, estimated_value, temperature, stage_id, has_been_contacted,
          contact_method, next_follow_up, notes, position, created_by, updated_by
        ) values (
          ${lead.company_or_person as string}, ${lead.contact_name ?? null}, ${lead.phone ?? null},
          ${lead.email ?? null}, ${lead.source ?? null}, ${lead.segment ?? null}, ${lead.city ?? null},
          ${lead.uf ?? null}, ${lead.owner_id ?? null}, ${lead.estimated_value ?? 0},
          ${lead.temperature ?? "morno"}, ${lead.stage_id as string}, ${lead.has_been_contacted ?? false},
          ${lead.contact_method ?? null}, ${lead.next_follow_up ?? null}, ${lead.notes ?? null},
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
      if (!canAccessLead(current, userId, roles)) return fail("Sem permissao para alterar este lead.", 403);

      const updates = cleanLeadPayload(body.updates);
      if (Object.prototype.hasOwnProperty.call(updates, "owner_id")) {
        await assertAssignableOwner(updates.owner_id);
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

      return json({ lead: normalizeLead(updated) });
    }

    if (action === "delete") {
      if (!flags.canManageAll) return fail("Sem permissao para excluir leads.", 403);
      const id = body.id as string | undefined;
      if (!id) return fail("Lead nao informado.");
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
