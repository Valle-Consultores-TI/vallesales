import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "./useAuth";
import { useFunnelAccessOptions } from "./useFunnels";
import type { Funnel, FunnelAccessOption } from "@/types/crm";

type ActiveFunnelContextValue = {
  funnels: Funnel[];
  funnelOptions: FunnelAccessOption[];
  activeFunnelId: string | null;
  activeFunnel: Funnel | null;
  loading: boolean;
  hasMultipleFunnels: boolean;
  setActiveFunnelId: (funnelId: string) => void;
};

const STORAGE_KEY = "vallesales-active-funnel-id";

const ActiveFunnelContext = createContext<ActiveFunnelContextValue | undefined>(undefined);

export const ActiveFunnelProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const funnelOptionsQuery = useFunnelAccessOptions(!!user);
  const funnelOptions = useMemo(() => funnelOptionsQuery.data ?? [], [funnelOptionsQuery.data]);
  const funnels = useMemo(
    () => funnelOptions.filter((funnel) => funnel.has_access),
    [funnelOptions],
  );
  const [activeFunnelId, setActiveFunnelIdState] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setActiveFunnelIdState(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!user) {
      window.localStorage.removeItem(STORAGE_KEY);
      setActiveFunnelIdState(null);
      return;
    }

    if (funnelQueryStillLoading(authLoading, funnelOptionsQuery.isLoading)) return;
    if (funnels.length === 0) {
      setActiveFunnelIdState(null);
      return;
    }

    const current = funnels.find((funnel) => funnel.id === activeFunnelId);
    if (current) {
      window.localStorage.setItem(STORAGE_KEY, current.id);
      return;
    }

    const next = funnels.find((funnel) => funnel.is_default) ?? funnels[0];
    setActiveFunnelIdState(next.id);
    window.localStorage.setItem(STORAGE_KEY, next.id);
  }, [activeFunnelId, authLoading, funnelOptionsQuery.isLoading, funnels, user]);

  const setActiveFunnelId = (funnelId: string) => {
    const targetOption = funnelOptions.find((funnel) => funnel.id === funnelId);
    if (targetOption && !targetOption.has_access) {
      toast.warning("Voce nao tem acesso a esse funil.");
      return;
    }

    setActiveFunnelIdState(funnelId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, funnelId);
    }
  };

  const activeFunnel = useMemo(
    () => funnels.find((funnel) => funnel.id === activeFunnelId) ?? null,
    [activeFunnelId, funnels],
  );

  return (
    <ActiveFunnelContext.Provider
      value={{
        funnels,
        funnelOptions,
        activeFunnelId,
        activeFunnel,
        loading: authLoading || funnelOptionsQuery.isLoading,
        hasMultipleFunnels: funnels.length > 1,
        setActiveFunnelId,
      }}
    >
      {children}
    </ActiveFunnelContext.Provider>
  );
};

const funnelQueryStillLoading = (authLoading: boolean, funnelLoading: boolean) => authLoading || funnelLoading;

// eslint-disable-next-line react-refresh/only-export-components
export const useActiveFunnel = () => {
  const ctx = useContext(ActiveFunnelContext);
  if (!ctx) throw new Error("useActiveFunnel must be used within ActiveFunnelProvider");
  return ctx;
};
