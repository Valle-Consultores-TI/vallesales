import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Lead, LeadInsert, LeadUpdate, PipelineStage, Profile } from "@/types/crm";
import { toast } from "sonner";
import { useAuth } from "./useAuth";

type ApiErrorPayload = {
  error?: string;
};

const hasApiError = (data: unknown): data is ApiErrorPayload =>
  typeof data === "object" && data !== null && "error" in data;

const shouldFallbackToDirectStageUpdate = (error: { message?: string; details?: string; code?: string } | null) => {
  const haystack = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return haystack.includes("rename_pipeline_stage") && haystack.includes("schema cache");
};

const shouldExplainMissingCreateStageRpc = (error: { message?: string; details?: string; code?: string } | null) => {
  const haystack = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return haystack.includes("create_pipeline_stage") && haystack.includes("schema cache");
};

const shouldFallbackToDirectStageDelete = (error: { message?: string; details?: string; code?: string } | null) => {
  const haystack = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return haystack.includes("delete_pipeline_stage") && haystack.includes("schema cache");
};

const buildStageKey = () => `stage_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

const sortStagesByPosition = (stages: PipelineStage[]) =>
  [...stages].sort((left, right) => left.position - right.position || left.created_at.localeCompare(right.created_at));

const invokeLeadsApi = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke("leads-api", { body });
  if (error) throw error;
  if (hasApiError(data) && data.error) throw new Error(data.error);
  return data as T;
};

const ALL_FUNNELS_KEY = "__all__";

export const useStages = (funnelId?: string | null, enabled = true) => {
  return useQuery({
    queryKey: ["pipeline_stages", funnelId ?? ALL_FUNNELS_KEY],
    enabled,
    queryFn: async () => {
      let query = supabase.from("pipeline_stages").select("*");
      if (funnelId) {
        query = query.eq("funnel_id", funnelId);
      }
      const { data, error } = await query.order("position");
      if (error) throw error;
      return data as PipelineStage[];
    },
  });
};

export const useRenamePipelineStage = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      funnelId,
      stageId,
      name,
    }: {
      funnelId: string;
      stageId: string;
      name: string;
    }) => {
      const trimmed = name.trim();
      if (!trimmed) {
        throw new Error("Informe o nome da etapa.");
      }

      const { data, error } = await supabase.rpc("rename_pipeline_stage", {
        _funnel_id: funnelId,
        _stage_id: stageId,
        _name: trimmed,
      });
      if (error) {
        if (!shouldFallbackToDirectStageUpdate(error)) {
          throw error;
        }

        const { data: directData, error: directError } = await supabase
          .from("pipeline_stages")
          .update({ name: trimmed })
          .eq("id", stageId)
          .eq("funnel_id", funnelId)
          .select("*")
          .single();

        if (directError) throw directError;
        return directData as PipelineStage;
      }
      return data as PipelineStage;
    },
    onSuccess: (updatedStage) => {
      qc.setQueriesData<PipelineStage[]>({ queryKey: ["pipeline_stages"] }, (current) =>
        current ? current.map((stage) => (stage.id === updatedStage.id ? updatedStage : stage)) : current,
      );
      qc.invalidateQueries({ queryKey: ["pipeline_stages"] });
      toast.success("Nome da etapa atualizado");
    },
    onError: (error: Error) => toast.error(error.message),
  });
};

export const useCreatePipelineStage = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      funnelId,
      name,
      afterStageId,
    }: {
      funnelId: string;
      name: string;
      afterStageId?: string | null;
    }) => {
      const trimmed = name.trim();
      if (!trimmed) {
        throw new Error("Informe o nome da etapa.");
      }

      const { data, error } = await supabase.rpc("create_pipeline_stage", {
        _after_stage_id: afterStageId ?? null,
        _funnel_id: funnelId,
        _name: trimmed,
      });

      if (error) {
        if (!shouldExplainMissingCreateStageRpc(error)) {
          throw error;
        }

        const { data: currentStages, error: stagesError } = await supabase
          .from("pipeline_stages")
          .select("*")
          .eq("funnel_id", funnelId)
          .order("position");

        if (stagesError) throw stagesError;

        const stages = (currentStages ?? []) as PipelineStage[];
        const referenceStage = afterStageId ? stages.find((stage) => stage.id === afterStageId) ?? null : null;

        if (afterStageId && !referenceStage) {
          throw new Error("Nao foi possivel encontrar a etapa de referencia neste funil.");
        }

        let insertPosition = 1;

        if (referenceStage) {
          insertPosition = referenceStage.is_won || referenceStage.is_lost
            ? referenceStage.position
            : referenceStage.position + 1;
        } else {
          const firstTerminalStage = sortStagesByPosition(stages).find((stage) => stage.is_won || stage.is_lost) ?? null;
          insertPosition = firstTerminalStage
            ? firstTerminalStage.position
            : Math.max(0, ...stages.map((stage) => stage.position)) + 1;
        }

        const stagesToShift = sortStagesByPosition(
          stages.filter((stage) => stage.position >= insertPosition),
        ).reverse();

        for (const stage of stagesToShift) {
          const { error: shiftError } = await supabase
            .from("pipeline_stages")
            .update({ position: stage.position + 1 })
            .eq("id", stage.id)
            .eq("funnel_id", funnelId);

          if (shiftError) throw shiftError;
        }

        const { data: insertedStage, error: insertError } = await supabase
          .from("pipeline_stages")
          .insert({
            funnel_id: funnelId,
            key: buildStageKey(),
            name: trimmed,
            position: insertPosition,
            color: null,
            is_won: false,
            is_lost: false,
          })
          .select("*")
          .single();

        if (insertError) throw insertError;
        return insertedStage as PipelineStage;
      }

      return data as PipelineStage;
    },
    onSuccess: (createdStage) => {
      qc.setQueriesData<PipelineStage[]>({ queryKey: ["pipeline_stages"] }, (current) =>
        current
          ? sortStagesByPosition([
              ...current
                .filter((stage) => stage.id !== createdStage.id)
                .map((stage) => (
                  stage.position >= createdStage.position
                    ? { ...stage, position: stage.position + 1 }
                    : stage
                )),
              createdStage,
            ])
          : current,
      );
      qc.invalidateQueries({ queryKey: ["pipeline_stages"] });
      toast.success("Etapa criada");
    },
    onError: (error: Error) => toast.error(error.message),
  });
};

export const useDeletePipelineStage = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      funnelId,
      stageId,
    }: {
      funnelId: string;
      stageId: string;
    }) => {
      const { error } = await supabase.rpc("delete_pipeline_stage", {
        _funnel_id: funnelId,
        _stage_id: stageId,
      });

      if (error) {
        if (!shouldFallbackToDirectStageDelete(error)) {
          throw error;
        }

        const { data: currentStages, error: stagesError } = await supabase
          .from("pipeline_stages")
          .select("*")
          .eq("funnel_id", funnelId)
          .order("position");

        if (stagesError) throw stagesError;

        const stages = (currentStages ?? []) as PipelineStage[];
        const targetStage = stages.find((stage) => stage.id === stageId) ?? null;

        if (!targetStage) {
          throw new Error("Etapa do funil nao encontrada.");
        }

        if (targetStage.is_won || targetStage.is_lost) {
          throw new Error("As etapas finais de ganho ou perda nao podem ser excluidas.");
        }

        const { count, error: countError } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("funnel_id", funnelId)
          .eq("stage_id", stageId);

        if (countError) throw countError;

        if ((count ?? 0) > 0) {
          throw new Error("Nao e possivel excluir uma etapa que ainda possui leads vinculados.");
        }

        const { error: deleteError } = await supabase
          .from("pipeline_stages")
          .delete()
          .eq("id", stageId)
          .eq("funnel_id", funnelId);

        if (deleteError) throw deleteError;

        const stagesToShift = sortStagesByPosition(
          stages.filter((stage) => stage.id !== stageId && stage.position > targetStage.position),
        );

        for (const stage of stagesToShift) {
          const { error: shiftError } = await supabase
            .from("pipeline_stages")
            .update({ position: stage.position - 1 })
            .eq("id", stage.id)
            .eq("funnel_id", funnelId);

          if (shiftError) throw shiftError;
        }
      }
      return { funnelId, stageId };
    },
    onSuccess: ({ funnelId, stageId }) => {
      qc.setQueriesData<PipelineStage[]>({ queryKey: ["pipeline_stages"] }, (current) => {
        if (!current) return current;

        const deletedStage = current.find((stage) => stage.id === stageId && stage.funnel_id === funnelId);
        if (!deletedStage) {
          return current;
        }

        return sortStagesByPosition(
          current
            .filter((stage) => stage.id !== stageId)
            .map((stage) => (
              stage.funnel_id === funnelId && stage.position > deletedStage.position
                ? { ...stage, position: stage.position - 1 }
                : stage
            )),
        );
      });
      qc.invalidateQueries({ queryKey: ["pipeline_stages"] });
      toast.success("Etapa excluida");
    },
    onError: (error: Error) => toast.error(error.message),
  });
};

export const useLeads = (funnelId?: string | null, enabled = true) => {
  return useQuery({
    queryKey: ["leads", funnelId ?? ALL_FUNNELS_KEY],
    enabled,
    queryFn: async () => {
      const data = await invokeLeadsApi<{ leads: Lead[] }>({
        action: "list",
        funnel_id: funnelId ?? null,
      });
      return data.leads;
    },
  });
};

export const useProfiles = (enabled = true) => {
  return useQuery({
    queryKey: ["profiles"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("full_name");
      if (error) throw error;
      return data as Profile[];
    },
  });
};

/** Profiles ativos e que podem receber leads — usado em selects de responsável */
export const useAssignableProfiles = (funnelId?: string | null, enabled = true) => {
  return useQuery({
    queryKey: ["assignable_profiles", funnelId ?? ALL_FUNNELS_KEY],
    enabled,
    queryFn: async () => {
      const { data, error } = funnelId
        ? await supabase.rpc("list_assignable_users", { _funnel_id: funnelId })
        : await supabase.rpc("list_assignable_users");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });
};

export const useCreateLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lead: Omit<LeadInsert, "created_by" | "updated_by">) => {
      const data = await invokeLeadsApi<{ lead: Lead }>({ action: "create", lead });
      return data.lead;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["crm_notifications_feed"] });
      toast.success("Lead criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useUpdateLead = (options?: { errorMessage?: string }) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: LeadUpdate & { id: string }) => {
      const data = await invokeLeadsApi<{ lead: Lead }>({ action: "update", id, updates });
      return data.lead;
    },
    onSuccess: (updatedLead, vars) => {
      qc.setQueriesData<Lead[]>({ queryKey: ["leads"] }, (current) =>
        current ? current.map((lead) => (lead.id === updatedLead.id ? updatedLead : lead)) : current,
      );
      qc.setQueryData<Lead>(["lead", vars.id], updatedLead);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.id] });
      qc.invalidateQueries({ queryKey: ["lead_activities", vars.id] });
      qc.invalidateQueries({ queryKey: ["crm_notifications_feed"] });
    },
    onError: (e: Error) => toast.error(options?.errorMessage ?? e.message),
  });
};

export const useDeleteLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await invokeLeadsApi<{ ok: boolean }>({ action: "delete", id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead excluído");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useLeadDetails = (leadId: string | null) => {
  return useQuery({
    queryKey: ["lead", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const data = await invokeLeadsApi<{ lead: Lead }>({ action: "get", id: leadId! });
      return data.lead;
    },
  });
};

export const useLeadActivities = (leadId: string | null) => {
  return useQuery({
    queryKey: ["lead_activities", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_activities").select("*").eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

export const useLeadNotes = (leadId: string | null) => {
  return useQuery({
    queryKey: ["lead_notes", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_notes").select("*").eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

export const useAddNote = (leadId: string) => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (content: string) => {
      const { data, error } = await supabase.from("lead_notes")
        .insert({ lead_id: leadId, content, created_by: user?.id, updated_by: user?.id })
        .select().single();
      if (error) throw error;
      // also log activity
      await supabase.from("lead_activities").insert({
        lead_id: leadId, type: "note_added",
        description: "Nova observação adicionada",
        created_by: user?.id, updated_by: user?.id,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead_notes", leadId] });
      qc.invalidateQueries({ queryKey: ["lead_activities", leadId] });
      qc.invalidateQueries({ queryKey: ["crm_notifications_feed"] });
      toast.success("Observação adicionada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useLogContact = (leadId: string) => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ method, description }: { method: string; description?: string }) => {
      const { error } = await supabase.from("lead_activities").insert({
        lead_id: leadId, type: "contact_logged",
        contact_method: method as never,
        description: description || `Contato via ${method}`,
        created_by: user?.id, updated_by: user?.id,
      });
      if (error) throw error;
      // mark lead as contacted
      await supabase.from("leads").update({
        has_been_contacted: true,
        contact_method: method as never,
        updated_by: user?.id,
      }).eq("id", leadId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead_activities", leadId] });
      qc.invalidateQueries({ queryKey: ["crm_notifications_feed"] });
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Contato registrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useLeadAttachments = (leadId: string | null) => {
  return useQuery({
    queryKey: ["lead_attachments", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_attachments").select("*").eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

export const uploadLeadAttachmentFile = async ({
  leadId,
  file,
  userId,
  displayName,
  activityDescription,
}: {
  leadId: string;
  file: File;
  userId?: string | null;
  displayName?: string;
  activityDescription?: string;
}) => {
  const ext = file.name.split(".").pop();
  const path = `${leadId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
  const fileName = displayName ?? file.name;

  const { error: upErr } = await supabase.storage
    .from("lead-attachments").upload(path, file);
  if (upErr) {
    if (/row-level security|violates row level security/i.test(upErr.message)) {
      throw new Error("Nao foi possivel enviar o anexo por falta de permissao neste lead.");
    }
    throw upErr;
  }

  const { error } = await supabase.from("lead_attachments").insert({
    lead_id: leadId,
    file_name: fileName,
    file_path: path,
    file_size: file.size,
    mime_type: file.type,
    created_by: userId,
    updated_by: userId,
  });
  if (error) {
    await supabase.storage.from("lead-attachments").remove([path]);
    if (/row-level security|violates row level security/i.test(error.message)) {
      throw new Error("Nao foi possivel enviar o anexo por falta de permissao neste lead.");
    }
    throw error;
  }

  const { error: activityError } = await supabase.from("lead_activities").insert({
    lead_id: leadId,
    type: "attachment_added",
    description: activityDescription || `Anexo enviado: ${fileName}`,
    created_by: userId,
    updated_by: userId,
  });
  if (activityError) {
    console.warn("Nao foi possivel registrar a atividade do anexo.", activityError);
  }
};

export const useUploadAttachment = (leadId: string) => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (file: File) =>
      uploadLeadAttachmentFile({ leadId, file, userId: user?.id, displayName: file.name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead_attachments", leadId] });
      qc.invalidateQueries({ queryKey: ["lead_activities", leadId] });
      qc.invalidateQueries({ queryKey: ["crm_notifications_feed"] });
      toast.success("Anexo enviado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const downloadAttachment = async (path: string, fileName: string) => {
  const { data, error } = await supabase.storage.from("lead-attachments").download(path);
  if (error) { toast.error("Falha ao baixar"); return; }
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
};
