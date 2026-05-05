import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Profile } from "@/types/crm";
import type { AppRole, OperationalRole, UserAccessStatus } from "@/lib/access";
import {
  MANAGEABLE_STATUS_OPTIONS,
  ROLE_LABELS,
  ROLE_OPTIONS,
  STATUS_LABELS,
  isOperationalRole,
  isOwnerEmail,
} from "@/lib/access";

export type { AppRole, OperationalRole, UserAccessStatus };
export { MANAGEABLE_STATUS_OPTIONS, ROLE_LABELS, ROLE_OPTIONS, STATUS_LABELS };

export const useAllUserRoles = () => {
  return useQuery({
    queryKey: ["user_roles_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data;
    },
  });
};

export const useMyRoles = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my_roles", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((row) => row.role as AppRole);
    },
  });
};

export const useMyProfile = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my_profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Profile | null;
    },
  });
};

export const usePermissions = () => {
  const rolesQuery = useMyRoles();
  const profileQuery = useMyProfile();

  const roles = rolesQuery.data ?? [];
  const profile = profileQuery.data ?? null;
  const primaryRole = roles.find((role): role is OperationalRole => isOperationalRole(role)) ?? null;
  const status = (profile?.access_status ?? "pending") as UserAccessStatus;

  const has = (role: OperationalRole) => roles.includes(role);
  const isAdmin = has("admin");
  const isGestor = has("gestor");
  const isConsultor = has("consultor");
  const isVisualizador = has("visualizador");
  const isOwner = isOwnerEmail(profile?.email);
  const hasOperationalRole = primaryRole !== null;
  const isActive = status === "active" && profile?.is_active !== false && hasOperationalRole;
  const isPending = status === "pending" || !hasOperationalRole;
  const isSuspended = status === "suspended";
  const isInactive = status === "inactive";

  return {
    roles,
    primaryRole,
    profile,
    status,
    statusLabel: STATUS_LABELS[status],
    isLoading: rolesQuery.isLoading || profileQuery.isLoading,
    isAdmin,
    isGestor,
    isConsultor,
    isVisualizador,
    isOwner,
    isPending,
    isSuspended,
    isInactive,
    isActive,
    hasOperationalRole,
    canAccessApp: isActive,
    canManageTeam: isActive && (isAdmin || isGestor),
    canCreateLead: isActive && (isAdmin || isGestor || isConsultor),
    canEditAnyLead: isActive && (isAdmin || isGestor),
    canDeleteLead: isActive && (isAdmin || isGestor),
    canEditOwnLead: isActive && (isAdmin || isGestor || isConsultor),
    isReadOnly: isActive && isVisualizador && !isAdmin && !isGestor && !isConsultor,
  };
};
