"use client";

import { useMemo } from "react";
import { useSettings } from "../contexts/SettingsContext";
import {
  formatDateByLanguage,
  formatNumberByLanguage,
  getCategoryLabel,
  getLanguageDirection,
  getLanguageLocale,
  getSourceLabel,
  getThemeLabel,
  isRtlLanguage,
  translate,
} from "../lib/i18n";

export function useAppLanguage() {
  const { settings } = useSettings();
  const language = settings.language;

  return useMemo(
    () => ({
      language,
      dir: getLanguageDirection(language),
      locale: getLanguageLocale(language),
      isRtl: isRtlLanguage(language),
      t: (key: string, params?: Record<string, string | number | undefined>) =>
        translate(language, key, params),
      getSourceLabel: (source: Parameters<typeof getSourceLabel>[1]) =>
        getSourceLabel(language, source),
      getThemeLabel: (theme: Parameters<typeof getThemeLabel>[1]) =>
        getThemeLabel(language, theme),
      getCategoryLabel: (category: string) =>
        getCategoryLabel(language, category),
      formatNumber: (value: number) => formatNumberByLanguage(language, value),
      formatDate: (value: Date, options: Intl.DateTimeFormatOptions) =>
        formatDateByLanguage(language, value, options),
    }),
    [language]
  );
}
