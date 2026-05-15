import { FunctionsHttpError } from "@supabase/supabase-js";
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

const getFunctionsHttpErrorMessage = async (error: FunctionsHttpError) => {
  try {
    const response = error.context;
    const data = await response.json();
    if (hasApiError(data) && data.error) return data.error;
    if (typeof data === "string" && data.trim()) return data;
  } catch {
    try {
      const fallbackText = await error.context.text();
      if (fallbackText.trim()) return fallbackText;
    } catch {
      // Ignore parsing failures and fall back to the SDK message below.
    }
  }

  return error.message;
};

const shouldRetryLeadsApiAuth = (status: number | undefined, message: string) =>
  status === 401 || /sessao nao encontrada|jwt|unauthorized/i.test(message);

const readCurrentAccessToken = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData.session?.access_token ?? null;
};

const refreshAccessToken = async () => {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) return null;
  return data.session?.access_token ?? null;
};

const invokeLeadsApi = async <T>(body: Record<string, unknown>, retryOnAuthFailure = true): Promise<T> => {
  let accessToken = await readCurrentAccessToken();

  if (!accessToken) {
    accessToken = await refreshAccessToken();
  }

  const { data, error } = await supabase.functions.invoke("leads-api", {
    body,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const message = await getFunctionsHttpErrorMessage(error);
      const status = error.context.status;

      if (retryOnAuthFailure && shouldRetryLeadsApiAuth(status, message)) {
        const refreshedAccessToken = await refreshAccessToken();
        if (refreshedAccessToken && refreshedAccessToken !== accessToken) {
          return invokeLeadsApi<T>(body, false);
        }
      }

      if (status === 401) {
        throw new Error("Sua sessão expirou ou não foi encontrada. Entre novamente no sistema.");
      }

      throw new Error(message);
    }

    throw error;
  }

  if (hasApiError(data) && data.error) throw new Error(data.error);
  return data as T;
};

const ALL_FUNNELS_KEY = "__all__";
type LeadArchiveFilter = "active" | "archived" | "all";
const UNDO_WINDOW_MS = 5000;

type LeadActionInput = string | Lead;
type LeadCacheSnapshotEntry = {
  queryKey: readonly unknown[];
  previousLead?: Lead;
  previousIndex: number;
};
type LeadCacheSnapshot = {
  leadId: string;
  leadDetail?: Lead;
  leadLists: LeadCacheSnapshotEntry[];
};
type PendingLeadUndo = {
  timeoutId: ReturnType<typeof setTimeout>;
  restoreSnapshot: () => void;
  toastId?: string | number;
};

const pendingLeadUndos = new Map<string, PendingLeadUndo>();

const getLeadActionId = (input: LeadActionInput) => (typeof input === "string" ? input : input.id);

const removeLeadFromList = (items: Lead[], leadId: string) => items.filter((item) => item.id !== leadId);

const insertLeadAtIndex = (items: Lead[], lead: Lead, index: number) => {
  const nextItems = removeLeadFromList(items, lead.id);
  const safeIndex = index < 0 ? 0 : Math.min(index, nextItems.length);
  nextItems.splice(safeIndex, 0, lead);
  return nextItems;
};

const parseLeadListQueryKey = (queryKey: readonly unknown[]) => {
  if (queryKey[0] !== "leads") return null;

  const funnelKey = queryKey[1];
  const archived = queryKey[2];

  if (typeof funnelKey !== "string") return null;
  if (archived !== "active" && archived !== "archived" && archived !== "all") return null;

  return { funnelKey, archived } as const;
};

const captureLeadCacheSnapshot = (qc: ReturnType<typeof useQueryClient>, leadId: string): LeadCacheSnapshot => ({
  leadId,
  leadDetail: qc.getQueryData<Lead>(["lead", leadId]),
  leadLists: qc.getQueriesData<Lead[]>({ queryKey: ["leads"] }).map(([queryKey, current]) => {
    const previousIndex = current?.findIndex((item) => item.id === leadId) ?? -1;
    return {
      queryKey,
      previousLead: previousIndex >= 0 && current ? current[previousIndex] : undefined,
      previousIndex,
    };
  }),
});

const restoreLeadCacheSnapshot = (qc: ReturnType<typeof useQueryClient>, snapshot: LeadCacheSnapshot) => {
  snapshot.leadLists.forEach(({ queryKey, previousLead, previousIndex }) => {
    qc.setQueryData<Lead[] | undefined>(queryKey, (current) => {
      if (!current && !previousLead) return current;

      const items = current ?? [];
      if (!previousLead) return removeLeadFromList(items, snapshot.leadId);
      return insertLeadAtIndex(items, previousLead, previousIndex);
    });
  });

  if (snapshot.leadDetail) {
    qc.setQueryData<Lead>(["lead", snapshot.leadId], snapshot.leadDetail);
  } else {
    qc.removeQueries({ queryKey: ["lead", snapshot.leadId], exact: true });
  }
};

const getSnapshotLead = (input: LeadActionInput, snapshot: LeadCacheSnapshot) => {
  if (typeof input !== "string") return input;
  if (snapshot.leadDetail) return snapshot.leadDetail;
  return snapshot.leadLists.find((entry) => entry.previousLead)?.previousLead;
};

const applyLeadArchiveStateToCache = (qc: ReturnType<typeof useQueryClient>, lead: Lead) => {
  qc.getQueriesData<Lead[]>({ queryKey: ["leads"] }).forEach(([queryKey]) => {
    const meta = parseLeadListQueryKey(queryKey);
    if (!meta) return;
    if (meta.funnelKey !== ALL_FUNNELS_KEY && meta.funnelKey !== lead.funnel_id) return;

    qc.setQueryData<Lead[] | undefined>(queryKey, (current) => {
      if (!current) return current;

      const currentIndex = current.findIndex((item) => item.id === lead.id);
      const shouldInclude = meta.archived === "all" || (meta.archived === "archived" ? lead.is_archived : !lead.is_archived);

      if (!shouldInclude) return removeLeadFromList(current, lead.id);
      return insertLeadAtIndex(current, lead, currentIndex);
    });
  });

  qc.setQueryData<Lead>(["lead", lead.id], lead);
};

const applyLeadDeletionToCache = (qc: ReturnType<typeof useQueryClient>, leadId: string) => {
  qc.getQueriesData<Lead[]>({ queryKey: ["leads"] }).forEach(([queryKey]) => {
    qc.setQueryData<Lead[] | undefined>(queryKey, (current) => (
      current ? removeLeadFromList(current, leadId) : current
    ));
  });

  qc.removeQueries({ queryKey: ["lead", leadId], exact: true });
};

const cancelPendingLeadUndo = (leadId: string) => {
  const pending = pendingLeadUndos.get(leadId);
  if (!pending) return;

  clearTimeout(pending.timeoutId);
  pending.restoreSnapshot();
  if (pending.toastId !== undefined) {
    toast.dismiss(pending.toastId);
  }
  pendingLeadUndos.delete(leadId);
};

const invalidateLeadActionQueries = (qc: ReturnType<typeof useQueryClient>, leadId: string) => {
  qc.invalidateQueries({ queryKey: ["leads"] });
  qc.invalidateQueries({ queryKey: ["lead", leadId] });
  qc.invalidateQueries({ queryKey: ["lead_activities", leadId] });
  qc.invalidateQueries({ queryKey: ["lead_notes", leadId] });
  qc.invalidateQueries({ queryKey: ["lead_attachments", leadId] });
  qc.invalidateQueries({ queryKey: ["crm_notifications_feed"] });
};

const scheduleUndoableLeadAction = async <T>({
  qc,
  input,
  toastMessage,
  applyOptimistic,
  commit,
  onCommitSuccess,
}: {
  qc: ReturnType<typeof useQueryClient>;
  input: LeadActionInput;
  toastMessage: string;
  applyOptimistic: (lead: Lead | undefined) => void;
  commit: (leadId: string) => Promise<T>;
  onCommitSuccess?: (result: T, leadId: string) => void;
}) => {
  const leadId = getLeadActionId(input);
  cancelPendingLeadUndo(leadId);

  const snapshot = captureLeadCacheSnapshot(qc, leadId);
  const snapshotLead = getSnapshotLead(input, snapshot);

  applyOptimistic(snapshotLead);

  const restoreSnapshot = () => restoreLeadCacheSnapshot(qc, snapshot);
  const timeoutId = setTimeout(async () => {
    pendingLeadUndos.delete(leadId);

    try {
      const result = await commit(leadId);
      onCommitSuccess?.(result, leadId);
      invalidateLeadActionQueries(qc, leadId);
    } catch (error) {
      restoreSnapshot();
      invalidateLeadActionQueries(qc, leadId);
      toast.error(error instanceof Error ? error.message : "Nao foi possivel concluir a acao.");
    }
  }, UNDO_WINDOW_MS);

  const pendingAction: PendingLeadUndo = {
    timeoutId,
    restoreSnapshot,
  };

  let toastId: string | number | undefined;
  const undoAction = () => {
    clearTimeout(timeoutId);
    restoreSnapshot();
    if (toastId !== undefined) {
      toast.dismiss(toastId);
    }
    pendingLeadUndos.delete(leadId);
  };

  toastId = toast.success(toastMessage, {
    duration: UNDO_WINDOW_MS,
    action: {
      label: "Desfazer",
      onClick: undoAction,
    },
  });

  pendingAction.toastId = toastId;
  pendingLeadUndos.set(leadId, pendingAction);
};

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
          throw new Error("Não foi possível encontrar a etapa de referência neste funil.");
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
          throw new Error("Etapa do funil não encontrada.");
        }

        if (targetStage.is_won || targetStage.is_lost) {
          throw new Error("As etapas finais de ganho ou perda não podem ser excluídas.");
        }

        const { count, error: countError } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("funnel_id", funnelId)
          .eq("stage_id", stageId);

        if (countError) throw countError;

        if ((count ?? 0) > 0) {
          throw new Error("Não é possível excluir uma etapa que ainda possui leads vinculados.");
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

export const useLeads = (
  funnelId?: string | null,
  enabled = true,
  options?: { archived?: LeadArchiveFilter },
) => {
  const archived = options?.archived ?? "active";

  return useQuery({
    queryKey: ["leads", funnelId ?? ALL_FUNNELS_KEY, archived],
    enabled,
    queryFn: async () => {
      const data = await invokeLeadsApi<{ leads: Lead[] }>({
        action: "list",
        archived,
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

export const useArchiveLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LeadActionInput) => {
      await scheduleUndoableLeadAction({
        qc,
        input,
        toastMessage: "Negocio arquivado",
        applyOptimistic: (lead) => {
          if (!lead) return;
          applyLeadArchiveStateToCache(qc, {
            ...lead,
            is_archived: true,
            archived_at: new Date().toISOString(),
          });
        },
        commit: async (leadId) => {
          const data = await invokeLeadsApi<{ lead: Lead }>({ action: "archive", id: leadId });
          return data.lead;
        },
        onCommitSuccess: (updatedLead) => {
          applyLeadArchiveStateToCache(qc, updatedLead);
        },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
export const useRestoreLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LeadActionInput) => {
      await scheduleUndoableLeadAction({
        qc,
        input,
        toastMessage: "Negocio desarquivado",
        applyOptimistic: (lead) => {
          if (!lead) return;
          applyLeadArchiveStateToCache(qc, {
            ...lead,
            is_archived: false,
            archived_at: null,
          });
        },
        commit: async (leadId) => {
          const data = await invokeLeadsApi<{ lead: Lead }>({ action: "restore", id: leadId });
          return data.lead;
        },
        onCommitSuccess: (updatedLead) => {
          applyLeadArchiveStateToCache(qc, updatedLead);
        },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
export const useReopenLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, targetStageId }: { id: string; targetStageId?: string | null }) => {
      const data = await invokeLeadsApi<{ lead: Lead }>({
        action: "reopen",
        id,
        target_stage_id: targetStageId ?? null,
      });
      return data.lead;
    },
    onSuccess: (updatedLead, vars) => {
      qc.setQueryData<Lead>(["lead", vars.id], updatedLead);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.id] });
      qc.invalidateQueries({ queryKey: ["lead_activities", vars.id] });
      qc.invalidateQueries({ queryKey: ["crm_notifications_feed"] });
      toast.success("Negócio reaberto");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeleteLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LeadActionInput) => {
      await scheduleUndoableLeadAction({
        qc,
        input,
        toastMessage: "Lead excluido",
        applyOptimistic: () => {
          applyLeadDeletionToCache(qc, getLeadActionId(input));
        },
        commit: async (leadId) => {
          await invokeLeadsApi<{ ok: boolean }>({ action: "delete", id: leadId });
        },
      });
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

export const addLeadNoteEntry = async ({
  leadId,
  content,
  userId,
  activityDescription = "Nova observação adicionada",
}: {
  leadId: string;
  content: string;
  userId?: string | null;
  activityDescription?: string;
}) => {
  const { data, error } = await supabase.from("lead_notes")
    .insert({ lead_id: leadId, content, created_by: userId, updated_by: userId })
    .select().single();
  if (error) throw error;

  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    type: "note_added",
    description: activityDescription,
    created_by: userId,
    updated_by: userId,
  });

  return data;
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
      throw new Error("Não foi possível enviar o anexo por falta de permissão neste lead.");
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
      throw new Error("Não foi possível enviar o anexo por falta de permissão neste lead.");
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
    console.warn("Não foi possível registrar a atividade do anexo.", activityError);
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

