import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type UiScale = "compact" | "default" | "comfortable";

const STORAGE_KEY = "vallesales-ui-scale";

interface UiScaleContextValue {
  scale: UiScale;
  setScale: (scale: UiScale) => void;
}

const UiScaleContext = createContext<UiScaleContextValue | undefined>(undefined);

const isUiScale = (value: string | null): value is UiScale =>
  value === "compact" || value === "default" || value === "comfortable";

export const UiScaleProvider = ({ children }: { children: ReactNode }) => {
  const [scale, setScale] = useState<UiScale>(() => {
    if (typeof window === "undefined") return "default";

    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isUiScale(stored) ? stored : "default";
  });

  useEffect(() => {
    document.documentElement.dataset.uiScale = scale;
    window.localStorage.setItem(STORAGE_KEY, scale);
  }, [scale]);

  const value = useMemo(() => ({ scale, setScale }), [scale]);

  return <UiScaleContext.Provider value={value}>{children}</UiScaleContext.Provider>;
};

export const useUiScale = () => {
  const context = useContext(UiScaleContext);

  if (!context) {
    throw new Error("useUiScale must be used within UiScaleProvider");
  }

  return context;
};
