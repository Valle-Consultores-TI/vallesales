import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
export { numericValue } from "@/lib/ekontroll";

export type EKontrollCompany = Record<string, unknown> & {
  api_key_cliente?: string;
  razao_social?: string;
  nome_fantasia?: string;
  inscricao_federal?: string;
  status_empresa?: string;
};

export type EKontrollSummary = {
  period: { start: string; end: string };
  fiscal: Record<string, unknown>[];
  payroll: Record<string, unknown>[];
  billing: Record<string, unknown>[];
};

const invoke = async <T>(body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("ekontroll-api", { body });
  if (error) {
    // FunctionsHttpError uses a generic message for non-2xx responses. The
    // Edge Function returns a safe, actionable message in the JSON body, so
    // surface that message instead of hiding it behind the generic wrapper.
    const context = (error as { context?: unknown }).context as {
      clone?: () => { json: () => Promise<unknown> };
      json?: () => Promise<unknown>;
    } | undefined;
    if (context && typeof context.json === "function") {
      try {
        const payload = await (context.clone?.() ?? context).json() as { error?: unknown };
        if (typeof payload?.error === "string" && payload.error.trim()) {
          throw new Error(payload.error);
        }
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message !== error.message) throw parseError;
      }
    }
    throw error;
  }
  return data as T;
};

export const useEKontrollCompanies = (enabled = true) => useQuery({
  queryKey: ["ekontroll", "companies"],
  enabled,
  queryFn: async () => {
    const response = await invoke<{ rows: EKontrollCompany[] }>({ action: "companies" });
    return response.rows ?? [];
  },
  staleTime: 5 * 60_000,
});

export const useEKontrollSummary = ({
  clientKeys,
  startMonth,
  endMonth,
  enabled = true,
}: {
  clientKeys?: string[];
  startMonth: string;
  endMonth: string;
  enabled?: boolean;
}) => useQuery({
  queryKey: ["ekontroll", "summary", clientKeys, startMonth, endMonth],
  // When the list endpoint does not expose per-company keys, the Edge
  // Function can still use EKONTROLL_API_KEY_CLIENTE from its secret.
  enabled,
  queryFn: () => invoke<EKontrollSummary>({
    action: "summary",
    client_keys: clientKeys,
    start_month: startMonth,
    end_month: endMonth,
  }),
  staleTime: 2 * 60_000,
});

export const getCompanyKey = (company: EKontrollCompany | undefined) =>
  String(company?.api_key_cliente ?? company?.apiKeyCliente ?? company?.chave_api_cliente ?? "");

export const getCompanyName = (company: EKontrollCompany) =>
  String(company.razao_social ?? company.nome_fantasia ?? company.nome ?? company.inscricao_federal ?? "Empresa sem nome");
