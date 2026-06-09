"use client";

export type PreferredSearchSource =
  | "youtube"
  | "youtubemusic"
  | "soundcloud"
  | "jiosaavn";

export type AppTheme =
  | "default"
  | "ocean"
  | "amethyst"
  | "sunset"
  | "forest"
  | "rose"
  | "frost"
  | "midnight"
  | "ember"
  | "aurora"
  | "sapphire"
  | "violet"
  | "copper"
  | "graphite"
  | "lagoon"
  | "ruby"
  | "olive"
  | "starlight"
  | "dawn"
  | "mist"
  | "petal"
  | "meadow"
  | "daybreak"
  | "linen"
  | "sky"
  | "lavender"
  | "peach"
  | "mint"
  | "butter"
  | "sage"
  | "ice"
  | "sand"
  | "blush";

export type AppLanguage = "en" | "fa";

export interface AppSettings {
  autoplayRecommendations: boolean;
  openFullscreenOnPlay: boolean;
  lyricsEnabled: boolean;
  autoScrollLyrics: boolean;
  keyboardShortcuts: boolean;
  theme: AppTheme;
  language: AppLanguage;
  disableAnimations: boolean;
  rememberLastSearch: boolean;
  preferredSearchSource: PreferredSearchSource;
  seekStepSeconds: number;
}

export const APP_SETTINGS_STORAGE_KEY = "streamifyAppSettings";
export const SEEK_STEP_OPTIONS = [5, 10, 15, 30] as const;
export const LIGHT_APP_THEMES = [
  "dawn",
  "mist",
  "petal",
  "meadow",
  "daybreak",
  "linen",
  "sky",
  "lavender",
  "peach",
  "mint",
  "butter",
  "sage",
  "ice",
  "sand",
  "blush",
] as const;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  autoplayRecommendations: true,
  openFullscreenOnPlay: false,
  lyricsEnabled: true,
  autoScrollLyrics: true,
  keyboardShortcuts: true,
  theme: "default",
  language: "en",
  disableAnimations: false,
  rememberLastSearch: true,
  preferredSearchSource: "youtube",
  seekStepSeconds: 10,
};

function isAppLanguage(value: unknown): value is AppLanguage {
  return value === "en" || value === "fa";
}

function isAppTheme(value: unknown): value is AppTheme {
  return (
    value === "default" ||
    value === "ocean" ||
    value === "amethyst" ||
    value === "sunset" ||
    value === "forest" ||
    value === "rose" ||
    value === "frost" ||
    value === "midnight" ||
    value === "ember" ||
    value === "aurora" ||
    value === "sapphire" ||
    value === "violet" ||
    value === "copper" ||
    value === "graphite" ||
    value === "lagoon" ||
    value === "ruby" ||
    value === "olive" ||
    value === "starlight" ||
    value === "dawn" ||
    value === "mist" ||
    value === "petal" ||
    value === "meadow" ||
    value === "daybreak" ||
    value === "linen" ||
    value === "sky" ||
    value === "lavender" ||
    value === "peach" ||
    value === "mint" ||
    value === "butter" ||
    value === "sage" ||
    value === "ice" ||
    value === "sand" ||
    value === "blush"
  );
}

export function isLightAppTheme(theme: AppTheme): boolean {
  return (LIGHT_APP_THEMES as readonly AppTheme[]).includes(theme);
}

function isPreferredSearchSource(
  value: unknown
): value is PreferredSearchSource {
  return (
    value === "youtube" ||
    value === "youtubemusic" ||
    value === "soundcloud" ||
    value === "jiosaavn"
  );
}

function isSeekStepSeconds(
  value: unknown
): value is (typeof SEEK_STEP_OPTIONS)[number] {
  return (
    typeof value === "number" &&
    SEEK_STEP_OPTIONS.includes(value as (typeof SEEK_STEP_OPTIONS)[number])
  );
}

export function sanitizeAppSettings(value: unknown): AppSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_APP_SETTINGS;
  }

  const record = value as Partial<AppSettings>;

  return {
    autoplayRecommendations:
      typeof record.autoplayRecommendations === "boolean"
        ? record.autoplayRecommendations
        : DEFAULT_APP_SETTINGS.autoplayRecommendations,
    openFullscreenOnPlay:
      typeof record.openFullscreenOnPlay === "boolean"
        ? record.openFullscreenOnPlay
        : DEFAULT_APP_SETTINGS.openFullscreenOnPlay,
    lyricsEnabled:
      typeof record.lyricsEnabled === "boolean"
        ? record.lyricsEnabled
        : DEFAULT_APP_SETTINGS.lyricsEnabled,
    autoScrollLyrics:
      typeof record.autoScrollLyrics === "boolean"
        ? record.autoScrollLyrics
        : DEFAULT_APP_SETTINGS.autoScrollLyrics,
    keyboardShortcuts:
      typeof record.keyboardShortcuts === "boolean"
        ? record.keyboardShortcuts
        : DEFAULT_APP_SETTINGS.keyboardShortcuts,
    theme: isAppTheme(record.theme) ? record.theme : DEFAULT_APP_SETTINGS.theme,
    language: isAppLanguage(record.language)
      ? record.language
      : DEFAULT_APP_SETTINGS.language,
    disableAnimations:
      typeof record.disableAnimations === "boolean"
        ? record.disableAnimations
        : DEFAULT_APP_SETTINGS.disableAnimations,
    rememberLastSearch:
      typeof record.rememberLastSearch === "boolean"
        ? record.rememberLastSearch
        : DEFAULT_APP_SETTINGS.rememberLastSearch,
    preferredSearchSource: isPreferredSearchSource(record.preferredSearchSource)
      ? record.preferredSearchSource
      : DEFAULT_APP_SETTINGS.preferredSearchSource,
    seekStepSeconds: isSeekStepSeconds(record.seekStepSeconds)
      ? record.seekStepSeconds
      : DEFAULT_APP_SETTINGS.seekStepSeconds,
  };
}
