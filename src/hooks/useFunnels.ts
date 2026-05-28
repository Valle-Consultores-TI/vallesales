import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Funnel, FunnelAccessOption, FunnelModule } from "@/types/crm";

type FunnelQueryOptions = {
  module?: FunnelModule | "all";
};

const resolveFunnelModule = (funnel: { module?: string | null }) =>
  funnel.module === "customer_tracking" ? "customer_tracking" : "sales";

const filterFunnelsByModule = <T extends { module?: string | null }>(
  funnels: T[],
  module: FunnelModule | "all" = "sales",
) => (module === "all" ? funnels : funnels.filter((funnel) => resolveFunnelModule(funnel) === module));

export const useFunnels = (enabled = true, options?: FunnelQueryOptions) => {
  const module = options?.module ?? "sales";

  return useQuery({
    queryKey: ["funnels", module],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnels")
        .select("*")
        .order("module")
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return filterFunnelsByModule((data ?? []) as Funnel[], module);
    },
  });
};

export const useFunnelAccessOptions = (enabled = true, options?: FunnelQueryOptions) => {
  const module = options?.module ?? "sales";

  return useQuery({
    queryKey: ["funnel_access_options", module],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_funnels_with_access");
      if (error) throw error;
      return filterFunnelsByModule((data ?? []) as FunnelAccessOption[], module);
    },
  });
};

export const useCreateFunnel = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        throw new Error("Informe o nome do funil.");
      }

      const { data, error } = await supabase.rpc("create_funnel", { _name: trimmed });
      if (error) throw error;
      return data as Funnel;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["funnels"] });
      qc.invalidateQueries({ queryKey: ["funnel_access_options"] });
      qc.invalidateQueries({ queryKey: ["pipeline_stages"] });
      toast.success("Funil criado");
    },
    onError: (error: Error) => toast.error(error.message),
  });
};

export const useRenameFunnel = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ funnelId, name }: { funnelId: string; name: string }) => {
      const trimmed = name.trim();
      if (!trimmed) {
        throw new Error("Informe o nome do funil.");
      }

      const { data, error } = await supabase.rpc("rename_funnel", {
        _funnel_id: funnelId,
        _name: trimmed,
      });
      if (error) throw error;
      return data as Funnel;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["funnels"] });
      qc.invalidateQueries({ queryKey: ["funnel_access_options"] });
      toast.success("Nome do funil atualizado");
    },
    onError: (error: Error) => toast.error(error.message),
  });
};

export const useDeleteFunnel = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (funnelId: string) => {
      const { data, error } = await supabase.rpc("delete_funnel", {
        _funnel_id: funnelId,
      });
      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["funnels"] });
      qc.invalidateQueries({ queryKey: ["funnel_access_options"] });
      qc.invalidateQueries({ queryKey: ["pipeline_stages"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Funil excluido");
    },
    onError: (error: Error) => toast.error(error.message),
  });
};
