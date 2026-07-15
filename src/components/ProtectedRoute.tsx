import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCustomerTrackingAccess } from "@/hooks/useCustomerTrackingAccess";

const WAITING_ROUTE = "/aguardando-aprovacao";
const TRACKING_ROUTE = "/acompanhamento";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { user, loading } = useAuth();
  const isTrackingRoute = location.pathname === TRACKING_ROUTE;
  const { perms, hasCustomerTrackingAccess, isLoading: trackingAccessLoading } = useCustomerTrackingAccess(
    isTrackingRoute && !!user && !loading,
  );

  if (loading || (user && (perms.isLoading || trackingAccessLoading))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (isTrackingRoute && hasCustomerTrackingAccess) {
    return <>{children}</>;
  }

  if (perms.canAccessClientPortal && !perms.canAccessApp) {
    return <Navigate to={`/cliente/${user.id}`} replace />;
  }

  if (!perms.canAccessApp) {
    if (location.pathname === WAITING_ROUTE) return <>{children}</>;
    return <Navigate to={WAITING_ROUTE} replace />;
  }

  if (location.pathname === WAITING_ROUTE) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
