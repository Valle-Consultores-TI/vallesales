import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Funnel, FunnelAccessOption } from "@/types/crm";

export const useFunnels = (enabled = true) => {
  return useQuery({
    queryKey: ["funnels"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnels")
        .select("*")
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as Funnel[];
    },
  });
};

export const useFunnelAccessOptions = (enabled = true) => {
  return useQuery({
    queryKey: ["funnel_access_options"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_funnels_with_access");
      if (error) throw error;
      return (data ?? []) as FunnelAccessOption[];
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
