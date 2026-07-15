import { useMemo } from "react";
import { useAuth } from "./useAuth";
import { useFunnelAccessOptions } from "./useFunnels";
import { usePermissions } from "./useUserRoles";

export const useCustomerTrackingAccess = (enabled = true) => {
  const { user } = useAuth();
  const perms = usePermissions();
  const trackingFunnelsQuery = useFunnelAccessOptions(enabled && !!user, { module: "customer_tracking" });

  const isProfileActive = perms.status === "active" && perms.profile?.is_active !== false;

  const hasCustomerTrackingAccess = useMemo(() => {
    if (!isProfileActive) return false;
    return (trackingFunnelsQuery.data ?? []).some((funnel) => funnel.has_access);
  }, [isProfileActive, trackingFunnelsQuery.data]);

  return {
    perms,
    trackingFunnelsQuery,
    hasCustomerTrackingAccess,
    isLoading: perms.isLoading || (enabled && !!user && trackingFunnelsQuery.isLoading),
  };
};
