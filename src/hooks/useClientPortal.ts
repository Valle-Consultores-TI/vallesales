import { FunctionsHttpError } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type {
  ClientPortalClaimAccessResponse,
  ClientPortalInvitationAcceptResponse,
  ClientPortalInvitationContextResponse,
  ClientPortalInvitationSetupResponse,
  ClientPortalInvitationUpsertResponse,
  ClientPortalLinkResponse,
  ClientPortalOverviewResponse,
  ClientPortalProjectResponse,
  ClientPortalReferralListResponse,
  ClientPortalReferralSubmitResponse,
  ClientPortalUser,
} from "@/types/client-portal";

type ApiErrorPayload = {
  error?: string;
};

const hasApiError = (data: unknown): data is ApiErrorPayload =>
  typeof data === "object" && data !== null && "error" in data;

const shouldRetryAuth = (status: number | undefined, message: string) =>
  status === 401 || /sessao nao encontrada|jwt|unauthorized/i.test(message);

const readCurrentAccessToken = async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
};

const refreshAccessToken = async () => {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) return null;
  return data.session?.access_token ?? null;
};

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
      // Ignore fallback parsing failures.
    }
  }

  return error.message;
};

const invokeProtectedFunction = async <T>(
  functionName: "client-portal-api" | "leads-api",
  body: Record<string, unknown>,
  retryOnAuthFailure = true,
): Promise<T> => {
  let accessToken = await readCurrentAccessToken();

  if (!accessToken) {
    accessToken = await refreshAccessToken();
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const message = await getFunctionsHttpErrorMessage(error);
      const status = error.context.status;

      if (retryOnAuthFailure && shouldRetryAuth(status, message)) {
        const refreshedAccessToken = await refreshAccessToken();
        if (refreshedAccessToken && refreshedAccessToken !== accessToken) {
          return invokeProtectedFunction<T>(functionName, body, false);
        }
      }

      if (status === 401) {
        throw new Error("Sua sessao expirou ou nao foi encontrada. Entre novamente.");
      }

      throw new Error(message);
    }

    throw error;
  }

  if (hasApiError(data) && data.error) {
    throw new Error(data.error);
  }

  return data as T;
};

const invokeFunction = async <T>(
  functionName: "client-portal-api" | "leads-api",
  body: Record<string, unknown>,
): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const message = await getFunctionsHttpErrorMessage(error);
      throw new Error(message);
    }

    throw error;
  }

  if (hasApiError(data) && data.error) {
    throw new Error(data.error);
  }

  return data as T;
};

export const recordClientPortalLogin = () =>
  invokeProtectedFunction<{ ok: boolean; notifiedAdminCount: number; skipped: boolean }>("client-portal-api", {
    action: "record_login",
  });

export const useClientPortalOverview = (enabled = true) =>
  useQuery({
    queryKey: ["client_portal_overview"],
    enabled,
    queryFn: () => invokeProtectedFunction<ClientPortalOverviewResponse>("client-portal-api", {
      action: "overview",
    }),
  });

export const useClientPortalProject = (projectId?: string | null, enabled = true) =>
  useQuery({
    queryKey: ["client_portal_project", projectId ?? "__default__"],
    enabled,
    queryFn: () => invokeProtectedFunction<ClientPortalProjectResponse>("client-portal-api", {
      action: "project",
      project_id: projectId ?? null,
    }),
  });

export const useClientPortalReferrals = (projectId?: string | null, enabled = true) =>
  useQuery({
    queryKey: ["client_portal_referrals", projectId ?? "__default__"],
    enabled,
    queryFn: () => invokeProtectedFunction<ClientPortalReferralListResponse>("client-portal-api", {
      action: "list_referrals",
      project_id: projectId ?? null,
    }),
  });

export const useSubmitClientReferral = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      projectId?: string | null;
      referredCompanyOrPerson?: string;
      referredContactName: string;
      referredEmail: string;
      referredPhone: string;
      city?: string;
      uf?: string;
      serviceTypes: string[];
      notes?: string;
      hpField?: string;
      utmSource?: string | null;
      utmMedium?: string | null;
      utmCampaign?: string | null;
      utmTerm?: string | null;
      utmContent?: string | null;
      landingPath?: string | null;
      referrer?: string | null;
    }) => invokeProtectedFunction<ClientPortalReferralSubmitResponse>("client-portal-api", {
      action: "submit_referral",
      project_id: payload.projectId ?? null,
      referred_company_or_person: payload.referredCompanyOrPerson ?? "",
      referred_contact_name: payload.referredContactName,
      referred_email: payload.referredEmail,
      referred_phone: payload.referredPhone,
      city: payload.city ?? "",
      uf: payload.uf ?? "",
      service_types: payload.serviceTypes,
      notes: payload.notes ?? "",
      hp_field: payload.hpField ?? "",
      utm_source: payload.utmSource ?? null,
      utm_medium: payload.utmMedium ?? null,
      utm_campaign: payload.utmCampaign ?? null,
      utm_term: payload.utmTerm ?? null,
      utm_content: payload.utmContent ?? null,
      landing_path: payload.landingPath ?? null,
      referrer: payload.referrer ?? null,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client_portal_overview"] }),
        queryClient.invalidateQueries({ queryKey: ["client_portal_referrals"] }),
      ]);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
};

export const useClaimClientPortalAccess = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { documentNumber: string; trackingCode?: string }) =>
      invokeProtectedFunction<ClientPortalClaimAccessResponse>("client-portal-api", {
        action: "claim_access",
        document_number: payload.documentNumber,
        tracking_code: payload.trackingCode ?? "",
      }),
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client_portal_overview"] }),
        queryClient.invalidateQueries({ queryKey: ["client_portal_project"] }),
        queryClient.invalidateQueries({ queryKey: ["client_portal_referrals"] }),
      ]);
      toast.success(
        data.claimedCount > 0
          ? "Seus projetos foram liberados no portal."
          : "Nao encontramos novos projetos para liberar com esses dados.",
      );
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
};

export const useClientPortalUsers = (enabled = true) =>
  useQuery({
    queryKey: ["client_portal_users"],
    enabled,
    queryFn: async () => {
      const data = await invokeProtectedFunction<{ users: ClientPortalUser[] }>("leads-api", {
        action: "list_client_users",
      });
      return data.users;
    },
  });

export const useClientPortalLink = (leadId: string | null, enabled = true) =>
  useQuery({
    queryKey: ["client_portal_link", leadId],
    enabled: enabled && !!leadId,
    queryFn: () => invokeProtectedFunction<ClientPortalLinkResponse>("leads-api", {
      action: "get_client_portal_link",
      id: leadId,
    }),
  });

export const useSetClientPortalLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      leadId,
      clientUserId,
    }: {
      leadId: string;
      clientUserId: string | null;
    }) => invokeProtectedFunction<ClientPortalLinkResponse>("leads-api", {
      action: "set_client_portal_link",
      id: leadId,
      client_user_id: clientUserId,
    }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["client_portal_link", variables.leadId] });
      queryClient.invalidateQueries({ queryKey: ["client_portal_overview"] });
      toast.success("Vinculo do portal do cliente atualizado.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
};

export const useClientPortalInvitationSetup = (leadId: string | null, enabled = true) =>
  useQuery({
    queryKey: ["client_portal_invitation_setup", leadId],
    enabled: enabled && !!leadId,
    queryFn: () =>
      invokeProtectedFunction<ClientPortalInvitationSetupResponse>("leads-api", {
        action: "get_client_portal_invitation_setup",
        id: leadId,
      }),
  });

export const useUpsertClientPortalInvitation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      leadId: string;
      email: string;
      fullName?: string;
      documentNumber?: string;
      projectIds: string[];
      expiresInDays: number;
    }) =>
      invokeProtectedFunction<ClientPortalInvitationUpsertResponse>("leads-api", {
        action: "upsert_client_portal_invitation",
        id: payload.leadId,
        email: payload.email,
        full_name: payload.fullName ?? "",
        document_number: payload.documentNumber ?? "",
        project_ids: payload.projectIds,
        expires_in_days: payload.expiresInDays,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["client_portal_invitation_setup", variables.leadId] });
      queryClient.invalidateQueries({ queryKey: ["client_portal_link", variables.leadId] });
      toast.success("Convite do portal preparado.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
};

export const useRevokeClientPortalInvitation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { leadId: string; invitationId: string }) =>
      invokeProtectedFunction<{ ok: boolean }>("leads-api", {
        action: "revoke_client_portal_invitation",
        invitation_id: payload.invitationId,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["client_portal_invitation_setup", variables.leadId] });
      toast.success("Convite revogado.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
};

export const useClientPortalInvitationContext = (token: string | null, enabled = true) =>
  useQuery({
    queryKey: ["client_portal_invitation_context", token],
    enabled: enabled && !!token,
    queryFn: () =>
      invokeFunction<ClientPortalInvitationContextResponse>("client-portal-api", {
        action: "invitation_context",
        token,
      }),
  });

export const useAcceptClientPortalInvitation = () =>
  useMutation({
    mutationFn: (payload: { token: string }) =>
      invokeProtectedFunction<ClientPortalInvitationAcceptResponse>("client-portal-api", {
        action: "accept_invitation",
        token: payload.token,
      }),
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

export const useUpdateClientPortalProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ fullName }: { fullName: string }) => {
      const trimmedName = fullName.trim();

      if (!trimmedName) {
        throw new Error("Informe o nome da conta.");
      }

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      if (!userId) {
        throw new Error("Sessao de usuario nao encontrada.");
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ full_name: trimmedName })
        .eq("id", userId);

      if (profileError) throw profileError;

      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: trimmedName },
      });

      if (authError) throw authError;

      return { fullName: trimmedName };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client_portal_overview"] }),
        queryClient.invalidateQueries({ queryKey: ["client_portal_project"] }),
        queryClient.invalidateQueries({ queryKey: ["client_portal_referrals"] }),
        queryClient.invalidateQueries({ queryKey: ["my_profile"] }),
        queryClient.invalidateQueries({ queryKey: ["profiles"] }),
      ]);
      toast.success("Nome da conta atualizado.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
};
