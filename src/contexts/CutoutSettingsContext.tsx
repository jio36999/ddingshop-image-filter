import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { loadCutoutSettings, saveCutoutSettings } from "../services/storageService";
import type { CutoutSettings } from "../types/app";

type CutoutSettingsContextValue = {
  cutoutSettings: CutoutSettings;
  updateCutoutSettings: (nextSettings: CutoutSettings) => void;
};

const CutoutSettingsContext = createContext<CutoutSettingsContextValue | null>(null);

type CutoutSettingsProviderProps = {
  children: ReactNode;
};

export function CutoutSettingsProvider({ children }: CutoutSettingsProviderProps) {
  const [cutoutSettings, setCutoutSettings] = useState<CutoutSettings>(() => loadCutoutSettings());

  const value = useMemo<CutoutSettingsContextValue>(
    () => ({
      cutoutSettings,
      updateCutoutSettings: (nextSettings) => {
        setCutoutSettings(nextSettings);
        saveCutoutSettings(nextSettings);
      },
    }),
    [cutoutSettings],
  );

  return <CutoutSettingsContext.Provider value={value}>{children}</CutoutSettingsContext.Provider>;
}

export function useCutoutSettings() {
  const context = useContext(CutoutSettingsContext);
  if (!context) {
    throw new Error("useCutoutSettings must be used within CutoutSettingsProvider.");
  }

  return context;
}
