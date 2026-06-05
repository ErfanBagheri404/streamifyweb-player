"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  APP_SETTINGS_STORAGE_KEY,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  sanitizeAppSettings,
} from "../lib/app-settings";

const SEARCH_STATE_UPDATED_EVENT = "streamify-search-state-updated";

interface SettingsContextType {
  settings: AppSettings;
  hasHydratedSettings: boolean;
  updateSettings: (updates: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [hasHydratedSettings, setHasHydratedSettings] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
      if (saved) {
        setSettings(sanitizeAppSettings(JSON.parse(saved)));
      }
    } catch {}

    setHasHydratedSettings(true);
  }, []);

  useEffect(() => {
    if (!hasHydratedSettings) return;

    try {
      window.localStorage.setItem(
        APP_SETTINGS_STORAGE_KEY,
        JSON.stringify(settings)
      );
    } catch {}
  }, [hasHydratedSettings, settings]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.classList.toggle("reduce-motion", settings.disableAnimations);

    return () => {
      root.classList.remove("reduce-motion");
      delete root.dataset.theme;
    };
  }, [settings.disableAnimations, settings.theme]);

  useEffect(() => {
    if (settings.rememberLastSearch) return;

    try {
      window.localStorage.removeItem("lastSearch");
      window.dispatchEvent(new CustomEvent(SEARCH_STATE_UPDATED_EVENT));
    } catch {}
  }, [settings.rememberLastSearch]);

  const value = useMemo<SettingsContextType>(
    () => ({
      settings,
      hasHydratedSettings,
      updateSettings: (updates) => {
        setSettings((current) =>
          sanitizeAppSettings({ ...current, ...updates })
        );
      },
      resetSettings: () => {
        setSettings(DEFAULT_APP_SETTINGS);
      },
    }),
    [hasHydratedSettings, settings]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }

  return context;
}
