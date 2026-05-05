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

export const useStages = () => {
  return useQuery({
    queryKey: ["pipeline_stages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pipeline_stages").select("*").order("position");
      if (error) throw error;
      return data as PipelineStage[];
    },
  });
};

export const useLeads = () => {
  return useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const data = await invokeLeadsApi<{ leads: Lead[] }>({ action: "list" });
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
export const useAssignableProfiles = () => {
  return useQuery({
    queryKey: ["assignable_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_assignable_users");
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
      toast.success("Lead criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useUpdateLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: LeadUpdate & { id: string }) => {
      const data = await invokeLeadsApi<{ lead: Lead }>({ action: "update", id, updates });
      return data.lead;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.id] });
      qc.invalidateQueries({ queryKey: ["lead_activities", vars.id] });
    },
    onError: (e: Error) => toast.error(e.message),
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
      if (upErr) throw upErr;
      const { error } = await supabase.from("lead_attachments").insert({
        lead_id: leadId, file_name: file.name, file_path: path,
        file_size: file.size, mime_type: file.type,
        created_by: user?.id, updated_by: user?.id,
      });
      if (error) throw error;
      await supabase.from("lead_activities").insert({
        lead_id: leadId, type: "attachment_added",
        description: `Anexo enviado: ${file.name}`,
        created_by: user?.id, updated_by: user?.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead_attachments", leadId] });
      qc.invalidateQueries({ queryKey: ["lead_activities", leadId] });
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
