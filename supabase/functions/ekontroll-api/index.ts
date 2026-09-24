import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const eKontrollApiKey = Deno.env.get("EKONTROLL_API_KEY");
const eKontrollOfficeKey = Deno.env.get("EKONTROLL_API_KEY_EMPRESA");
const eKontrollClientKey = Deno.env.get("EKONTROLL_API_KEY_CLIENTE");

if (!supabaseUrl || !serviceRoleKey) throw new Error("Configuracao do backend incompleta.");

const authClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fail = (message: string, status = 400) => json({ error: message }, status);

const normalizePeriod = (value: unknown, fallback: string) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return `${fallback}-01`;
  return `${value}-01`;
};

const apiRequest = async (method: string, params: Record<string, string>) => {
  const response = await fetch(`https://app.e-kontroll.com.br/api/v1/metodo/${method}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const record = typeof payload === "object" && payload !== null
      ? payload as Record<string, unknown>
      : null;
    const rawMessage = record?.message ?? record?.error ?? record?.api_key_cliente ?? record?.api_key ?? record?.api_key_empresa;
    const message = Array.isArray(rawMessage)
      ? rawMessage.filter((value) => typeof value === "string").join(" ")
      : typeof rawMessage === "string"
        ? rawMessage
        : `A API e-KONTROLL respondeu com HTTP ${response.status} no método ${method}.`;
    throw new Error(`${method}: ${message}`);
  }

  if (typeof payload === "object" && payload !== null && "status" in payload && Number((payload as { status?: unknown }).status) >= 400) {
    throw new Error("A API e-KONTROLL rejeitou a consulta. Verifique as chaves e permissões dos métodos.");
  }

  return payload;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const asRows = (value: unknown, hints: string[], depth: number): Record<string, unknown>[] => {
  if (!Array.isArray(value)) return [];
  const rows = value.filter(isRecord);
  if (!rows.length) return [];
  // At the top level, a direct array is already the API result. For nested
  // arrays, require fields belonging to the method being normalized so that
  // metadata arrays (for example array_honorarios) are not mistaken for rows.
  if (depth === 0 || !hints.length || rows.some((row) => hints.some((hint) => hint in row))) return rows;
  return [];
};

const unwrapRows = (payload: unknown, hints: string[] = [], depth = 0): Record<string, unknown>[] => {
  if (depth > 8) return [];
  const directRows = asRows(payload, hints, depth);
  if (directRows.length) return directRows;
  if (!isRecord(payload)) return [];

  const record = payload;
  const mappedRows = Object.values(record).filter(isRecord);
  if (mappedRows.length && mappedRows.some((row) => hints.some((hint) => hint in row))) return mappedRows;
  // Prefer the conventional API envelopes first, then inspect any nested
  // object. Different e-KONTROLL methods use different envelope names.
  const preferredKeys = ["data", "resultado", "result", "rows", "empresas", "items"];
  const values = [
    ...preferredKeys.map((key) => record[key]),
    ...Object.entries(record)
      .filter(([key]) => !preferredKeys.includes(key))
      .map(([, value]) => value),
  ];
  for (const value of values) {
    const rows = unwrapRows(value, hints, depth + 1);
    if (rows.length) return rows;
  }
  return [record];
};

const requireAuth = async (request: Request) => {
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data, error } = await authClient.auth.getUser(token);
  return !error && !!data.user;
};

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return fail("Metodo nao permitido.", 405);
  if (!(await requireAuth(request))) return fail("Autenticacao necessaria.", 401);
  if (!eKontrollApiKey) return fail("EKONTROLL_API_KEY nao configurada no backend.", 503);

  try {
    const body = await request.json() as Record<string, unknown>;
    const action = body.action;

    if (action === "companies") {
      if (!eKontrollOfficeKey) return fail("EKONTROLL_API_KEY_EMPRESA nao configurada no backend.", 503);
      const payload = await apiRequest("listar_empresas", {
        api_key: eKontrollApiKey,
        api_key_empresa: eKontrollOfficeKey,
      });
      return json({ rows: unwrapRows(payload, ["api_key_cliente", "razao_social", "inscricao_federal", "codi_emp", "status_empresa"]), source: "listar_empresas" });
    }

    if (action === "summary") {
      const requestedKeys = Array.isArray(body.client_keys)
        ? body.client_keys.filter((value): value is string => typeof value === "string" && value.trim()).map((value) => value.trim())
        : [];
      const singleKey = typeof body.client_key === "string" && body.client_key.trim() ? [body.client_key.trim()] : [];
      const clientKeys = [...new Set([...requestedKeys, ...singleKey, ...(eKontrollClientKey ? [eKontrollClientKey] : [])])];
      if (!clientKeys.length) return fail("Selecione uma empresa com API Key de cliente na listagem.", 400);

      const now = new Date();
      const fallbackEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const start = normalizePeriod(body.start_month, fallbackEnd);
      const end = normalizePeriod(body.end_month, fallbackEnd);
      const params = { api_key: eKontrollApiKey, api_key_cliente: clientKeys.join(","), comp_inicial: start, comp_final: end };
      const [fiscal, payroll, billing] = await Promise.all([
        apiRequest("fiscal_volumetria", params),
        apiRequest("folha_volumetria", params),
        apiRequest("faturamento", params),
      ]);

      return json({
        period: { start: start.slice(0, 7), end: end.slice(0, 7) },
        fiscal: unwrapRows(fiscal, ["servico_prestado_total", "entradas_total", "saidas_total", "codi_emp"]),
        payroll: unwrapRows(payroll, ["admissao", "demissao", "ferias", "total_vinculos", "codi_emp"]),
        billing: unwrapRows(billing, ["faturamento", "venda", "servico", "compras", "codi_emp"]),
      });
    }

    return fail("Acao e-KONTROLL desconhecida.");
  } catch (error) {
    console.error(error);
    return fail(error instanceof Error ? error.message : "Falha ao consultar o e-KONTROLL.", 502);
  }
});
