import enTranslations from "../locales/en.json";
import faTranslations from "../locales/fa.json";
import type {
  AppLanguage,
  AppTheme,
  PreferredSearchSource,
} from "./app-settings";

type TranslationParams = Record<string, string | number | undefined>;
type TranslationDictionary = Record<string, string>;

const pluralPattern =
  /\{(\w+),\s*plural,\s*one \{([^{}]*)\}\s*other \{([^{}]*)\}\s*\}/g;
const variablePattern = /\{(\w+)\}/g;

export const translations: Record<AppLanguage, TranslationDictionary> = {
  en: enTranslations,
  fa: faTranslations,
};

function formatTemplate(
  template: string,
  params: TranslationParams = {}
): string {
  return template
    .replace(
      pluralPattern,
      (_, key: string, singular: string, plural: string) => {
        const value = params[key];
        const numericValue =
          typeof value === "number"
            ? value
            : Number.parseFloat(String(value ?? ""));
        return numericValue === 1 ? singular : plural;
      }
    )
    .replace(variablePattern, (_, key: string) => String(params[key] ?? ""));
}

export function isRtlLanguage(language: AppLanguage): boolean {
  return language === "fa";
}

export function getLanguageDirection(language: AppLanguage): "ltr" | "rtl" {
  return isRtlLanguage(language) ? "rtl" : "ltr";
}

export function getLanguageLocale(language: AppLanguage): string {
  return language === "fa" ? "fa-IR" : "en-US";
}

export function translate(
  language: AppLanguage,
  key: string,
  params: TranslationParams = {}
): string {
  const entry = translations[language][key] ?? translations.en[key];
  return entry ? formatTemplate(entry, params) : key;
}

export function getSourceLabel(
  language: AppLanguage,
  source: PreferredSearchSource
): string {
  const key = `source.${source}`;
  return translate(language, key);
}

export function getThemeLabel(language: AppLanguage, theme: AppTheme): string {
  return translate(language, `theme.${theme}`);
}

export function getCategoryLabel(
  language: AppLanguage,
  category: string
): string {
  const key = `search.category.${category}`;
  const label = translate(language, key);
  return label === key ? category : label;
}

export function formatNumberByLanguage(
  language: AppLanguage,
  value: number
): string {
  return new Intl.NumberFormat(getLanguageLocale(language)).format(value);
}

export function formatDateByLanguage(
  language: AppLanguage,
  value: Date,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat(getLanguageLocale(language), options).format(
    value
  );
}
