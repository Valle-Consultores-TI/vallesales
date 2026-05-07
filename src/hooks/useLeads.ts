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

export const useUploadAttachment = (leadId: string) => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split(".").pop();
      const path = `${leadId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("lead-attachments").upload(path, file);
      if (upErr) {
        if (/row-level security|violates row level security/i.test(upErr.message)) {
          throw new Error("Nao foi possivel enviar o anexo por falta de permissao neste lead.");
        }
        throw upErr;
      }

      const { error } = await supabase.from("lead_attachments").insert({
        lead_id: leadId, file_name: file.name, file_path: path,
        file_size: file.size, mime_type: file.type,
        created_by: user?.id, updated_by: user?.id,
      });
      if (error) {
        await supabase.storage.from("lead-attachments").remove([path]);
        if (/row-level security|violates row level security/i.test(error.message)) {
          throw new Error("Nao foi possivel enviar o anexo por falta de permissao neste lead.");
        }
        throw error;
      }

      const { error: activityError } = await supabase.from("lead_activities").insert({
        lead_id: leadId, type: "attachment_added",
        description: `Anexo enviado: ${file.name}`,
        created_by: user?.id, updated_by: user?.id,
      });
      if (activityError) {
        console.warn("Nao foi possivel registrar a atividade do anexo.", activityError);
      }
    },
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
