"use client";

import type { ReactNode } from "react";
import { useAudio, type AutoRetryPreference } from "../contexts/AudioContext";
import { useAppLanguage } from "../hooks/useAppLanguage";
import { useSettings } from "../contexts/SettingsContext";
import {
  SEEK_STEP_OPTIONS,
  type AppLanguage,
  type AppTheme,
  type PreferredSearchSource,
} from "../lib/app-settings";

function SparkGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"
      />
    </svg>
  );
}

function Toggle({
  enabled,
  onClick,
  disabled = false,
}: {
  enabled: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { isRtl } = useAppLanguage();
  const justifyClass = enabled
    ? isRtl
      ? "justify-start"
      : "justify-end"
    : isRtl
    ? "justify-end"
    : "justify-start";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-8 w-14 items-center px-1 rounded-full transition ${justifyClass} ${
        enabled ? "theme-accent-fill" : "bg-white/12"
      } ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
      aria-pressed={enabled}
    >
      <span
        className="inline-block h-6 w-6 rounded-full bg-white shadow-[0_3px_10px_rgba(0,0,0,0.25)] transition"
      />
    </button>
  );
}

function ChoiceChip({
  label,
  selected,
  onClick,
  className = "",
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${className} ${
        selected
          ? "theme-accent-fill"
          : "bg-white/[0.06] text-white/72 hover:bg-white/[0.1] hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function SettingRow({
  label,
  description,
  control,
  layout = "inline",
}: {
  label: string;
  description: string;
  control: ReactNode;
  layout?: "inline" | "stacked";
}) {
  return (
    <div
      className={`theme-surface-soft flex rounded-xl border p-4 ${
        layout === "stacked"
          ? "flex-col gap-4"
          : "flex-col gap-3 md:flex-row md:items-center md:justify-between"
      }`}
    >
      <div className="min-w-0">
        <p className="text-base font-semibold text-white">{label}</p>
        <p className="mt-1 max-w-2xl text-sm text-white/52">{description}</p>
      </div>
      <div className={layout === "stacked" ? "w-full" : "shrink-0"}>
        {control}
      </div>
    </div>
  );
}

function ThemeChoiceCard({
  label,
  preview,
  selected,
  onClick,
}: {
  label: string;
  preview: [string, string, string];
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
        selected
          ? "theme-accent-soft border-white/25 text-white shadow-[0_0_0_1px_var(--theme-accent),0_14px_30px_rgba(0,0,0,0.28)]"
          : "theme-button-soft text-white/78 hover:bg-white/[0.08] hover:text-white"
      }`}
    >
      <span className="flex shrink-0 items-center gap-1.5">
        {preview.map((color, index) => (
          <span
            key={`${label}-${index}`}
            className="h-3 w-3 rounded-full border border-white/15"
            style={{ backgroundColor: color }}
          />
        ))}
      </span>
      <span className="min-w-0 flex-1 truncate text-start">{label}</span>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
          selected
            ? "theme-accent-fill border-transparent"
            : "border-white/12 bg-black/10 text-transparent"
        }`}
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-3.5 w-3.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m4 10 4 4 8-8" />
        </svg>
      </span>
    </button>
  );
}

function Section({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="theme-surface-strong rounded-xl border p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)] md:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">
        {title}
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-white/56">{description}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function AutoRetryValue({
  currentValue,
  onChange,
  labels,
}: {
  currentValue: AutoRetryPreference;
  onChange: (value: AutoRetryPreference) => void;
  labels: {
    ask: string;
    always: string;
    never: string;
  };
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ChoiceChip
        label={labels.ask}
        selected={currentValue === "unknown"}
        onClick={() => onChange("unknown")}
      />
      <ChoiceChip
        label={labels.always}
        selected={currentValue === "enabled"}
        onClick={() => onChange("enabled")}
      />
      <ChoiceChip
        label={labels.never}
        selected={currentValue === "disabled"}
        onClick={() => onChange("disabled")}
      />
    </div>
  );
}

export default function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const { t, getSourceLabel, getThemeLabel } = useAppLanguage();
  const {
    autoRetryPreference,
    enableAutoRetry,
    disableAutoRetry,
    resetAutoRetryPreference,
  } = useAudio();

  const handleAutoRetryChange = (value: AutoRetryPreference) => {
    if (value === "enabled") {
      enableAutoRetry();
      return;
    }
    if (value === "disabled") {
      disableAutoRetry();
      return;
    }
    resetAutoRetryPreference();
  };

  const searchSourceLabels: Record<PreferredSearchSource, string> = {
    youtube: getSourceLabel("youtube"),
    youtubemusic: getSourceLabel("youtubemusic"),
    soundcloud: getSourceLabel("soundcloud"),
    jiosaavn: getSourceLabel("jiosaavn"),
  };
  const themeLabels: Record<AppTheme, string> = {
    default: getThemeLabel("default"),
    ocean: getThemeLabel("ocean"),
    amethyst: getThemeLabel("amethyst"),
    sunset: getThemeLabel("sunset"),
    forest: getThemeLabel("forest"),
    rose: getThemeLabel("rose"),
    frost: getThemeLabel("frost"),
    midnight: getThemeLabel("midnight"),
    ember: getThemeLabel("ember"),
    aurora: getThemeLabel("aurora"),
    sapphire: getThemeLabel("sapphire"),
    violet: getThemeLabel("violet"),
    copper: getThemeLabel("copper"),
    graphite: getThemeLabel("graphite"),
    lagoon: getThemeLabel("lagoon"),
    ruby: getThemeLabel("ruby"),
    olive: getThemeLabel("olive"),
    starlight: getThemeLabel("starlight"),
  };
  const themeOptions: Array<{
    value: AppTheme;
    label: string;
    preview: [string, string, string];
  }> = [
    { value: "default", label: themeLabels.default, preview: ["#1ed760", "#181818", "#131313"] },
    { value: "ocean", label: themeLabels.ocean, preview: ["#5cc8ff", "#102235", "#0c1b2b"] },
    { value: "amethyst", label: themeLabels.amethyst, preview: ["#c084fc", "#241439", "#1b102c"] },
    { value: "sunset", label: themeLabels.sunset, preview: ["#ff9153", "#2a1610", "#21110d"] },
    { value: "forest", label: themeLabels.forest, preview: ["#4ade80", "#112219", "#0d1a13"] },
    { value: "rose", label: themeLabels.rose, preview: ["#fb7185", "#2a1220", "#210e18"] },
    { value: "frost", label: themeLabels.frost, preview: ["#67e8f9", "#10212a", "#0b1a22"] },
    { value: "midnight", label: themeLabels.midnight, preview: ["#818cf8", "#0e1330", "#0a1027"] },
    { value: "ember", label: themeLabels.ember, preview: ["#fb923c", "#28150f", "#1e100b"] },
    { value: "aurora", label: themeLabels.aurora, preview: ["#2dd4bf", "#0e241d", "#0a1c16"] },
    { value: "sapphire", label: themeLabels.sapphire, preview: ["#60a5fa", "#0f2035", "#0a182a"] },
    { value: "violet", label: themeLabels.violet, preview: ["#d8b4fe", "#241136", "#1a0d29"] },
    { value: "copper", label: themeLabels.copper, preview: ["#d97757", "#2a1711", "#1f110d"] },
    { value: "graphite", label: themeLabels.graphite, preview: ["#94a3b8", "#151922", "#10141c"] },
    { value: "lagoon", label: themeLabels.lagoon, preview: ["#22d3ee", "#0d2628", "#091d1f"] },
    { value: "ruby", label: themeLabels.ruby, preview: ["#f43f5e", "#2b121a", "#210d14"] },
    { value: "olive", label: themeLabels.olive, preview: ["#a3e635", "#212813", "#181d0e"] },
    { value: "starlight", label: themeLabels.starlight, preview: ["#a5b4fc", "#161a34", "#101327"] },
  ];
  const languageLabels: Record<AppLanguage, string> = {
    en: t("language.english"),
    fa: t("language.persian"),
  };

  const autoRetryLabel =
    autoRetryPreference === "enabled"
      ? t("settings.alwaysRetryOnce")
      : autoRetryPreference === "disabled"
      ? t("settings.neverRetryAutomatically")
      : t("settings.askWhenPlaybackFails");
  const motionLabel = settings.disableAnimations
    ? t("settings.animationsOff")
    : t("settings.animationsOn");
  const searchMemoryLabel = settings.rememberLastSearch
    ? t("settings.searchMemoryOn")
    : t("settings.searchMemoryOff");

  return (
    <div className="theme-surface-strong relative h-full overflow-y-auto hide-scrollbar rounded-xl text-white">
      <div className="relative space-y-5">
        <section className="theme-surface overflow-hidden rounded-xl border p-5 shadow-[0_30px_80px_rgba(0,0,0,0.28)] md:p-6">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/58">
                <SparkGlyph />
                {t("settings.personalize")}
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-white md:text-5xl">
                {t("settings.title")}
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-white/64 md:text-base">
                {t("settings.description")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white/52">
                {t("settings.autoRetry")}: {autoRetryLabel}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white/52">
                {t("settings.searchLabel")}:{" "}
                {searchSourceLabels[settings.preferredSearchSource]}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white/52">
                {t("settings.seekJump")}: {settings.seekStepSeconds}s
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white/52">
                {t("settings.theme")}: {themeLabels[settings.theme]}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white/52">
                {t("settings.motion")}: {motionLabel}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white/52">
                {t("settings.searchMemory")}: {searchMemoryLabel}
              </span>
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <Section
              eyebrow={t("settings.appearance")}
              title={t("settings.themeAndMotion")}
              description={t("settings.themeAndMotionDescription")}
            >
              <SettingRow
                label={t("settings.theme")}
                description={t("settings.themeDescription")}
                layout="stacked"
                control={
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {themeOptions.map(({ value, label, preview }) => (
                      <ThemeChoiceCard
                        key={value}
                        label={label}
                        preview={preview}
                        selected={settings.theme === value}
                        onClick={() => updateSettings({ theme: value })}
                      />
                    ))}
                  </div>
                }
              />
              <SettingRow
                label={t("settings.disableAnimations")}
                description={t("settings.disableAnimationsDescription")}
                control={
                  <Toggle
                    enabled={settings.disableAnimations}
                    onClick={() =>
                      updateSettings({
                        disableAnimations: !settings.disableAnimations,
                      })
                    }
                  />
                }
              />
              <SettingRow
                label={t("settings.language")}
                description={t("settings.languageDescription")}
                control={
                  <div className="flex flex-wrap gap-2">
                    {(
                      Object.entries(languageLabels) as Array<
                        [AppLanguage, string]
                      >
                    ).map(([value, label]) => (
                      <ChoiceChip
                        key={value}
                        label={label}
                        selected={settings.language === value}
                        onClick={() => updateSettings({ language: value })}
                      />
                    ))}
                  </div>
                }
              />
            </Section>

            <Section
              eyebrow={t("settings.playback")}
              title={t("settings.musicBehaves")}
              description={t("settings.musicBehavesDescription")}
            >
              <SettingRow
                label={t("settings.autoRetryPlayback")}
                description={t("settings.autoRetryPlaybackDescription")}
                control={
                  <AutoRetryValue
                    currentValue={autoRetryPreference}
                    onChange={handleAutoRetryChange}
                    labels={{
                      ask: t("settings.askMe"),
                      always: t("settings.alwaysRetry"),
                      never: t("settings.neverRetry"),
                    }}
                  />
                }
              />
              <SettingRow
                label={t("settings.autoplayRecommendedTracks")}
                description={t("settings.autoplayRecommendedTracksDescription")}
                control={
                  <Toggle
                    enabled={settings.autoplayRecommendations}
                    onClick={() =>
                      updateSettings({
                        autoplayRecommendations:
                          !settings.autoplayRecommendations,
                      })
                    }
                  />
                }
              />
              <SettingRow
                label={t("settings.openNowPlayingAutomatically")}
                description={t(
                  "settings.openNowPlayingAutomaticallyDescription"
                )}
                control={
                  <Toggle
                    enabled={settings.openFullscreenOnPlay}
                    onClick={() =>
                      updateSettings({
                        openFullscreenOnPlay: !settings.openFullscreenOnPlay,
                      })
                    }
                  />
                }
              />
            </Section>

            <Section
              eyebrow={t("settings.discovery")}
              title={t("settings.searchPreferences")}
              description={t("settings.searchPreferencesDescription")}
            >
              <SettingRow
                label={t("settings.defaultSearchSource")}
                description={t("settings.defaultSearchSourceDescription")}
                control={
                  <div className="flex flex-wrap gap-2">
                    {(
                      Object.entries(searchSourceLabels) as Array<
                        [PreferredSearchSource, string]
                      >
                    ).map(([value, label]) => (
                      <ChoiceChip
                        key={value}
                        label={label}
                        selected={settings.preferredSearchSource === value}
                        onClick={() =>
                          updateSettings({ preferredSearchSource: value })
                        }
                      />
                    ))}
                  </div>
                }
              />
              <SettingRow
                label={t("settings.rememberLastSearch")}
                description={t("settings.rememberLastSearchDescription")}
                control={
                  <Toggle
                    enabled={settings.rememberLastSearch}
                    onClick={() =>
                      updateSettings({
                        rememberLastSearch: !settings.rememberLastSearch,
                      })
                    }
                  />
                }
              />
            </Section>

            <Section
              eyebrow={t("settings.lyricsAndControls")}
              title={t("settings.readingAndInput")}
              description={t("settings.readingAndInputDescription")}
            >
              <SettingRow
                label={t("settings.lyrics")}
                description={t("settings.lyricsDescription")}
                control={
                  <Toggle
                    enabled={settings.lyricsEnabled}
                    onClick={() =>
                      updateSettings({
                        lyricsEnabled: !settings.lyricsEnabled,
                      })
                    }
                  />
                }
              />
              <SettingRow
                label={t("settings.autoScrollSyncedLyrics")}
                description={t("settings.autoScrollSyncedLyricsDescription")}
                control={
                  <Toggle
                    enabled={settings.autoScrollLyrics}
                    disabled={!settings.lyricsEnabled}
                    onClick={() =>
                      updateSettings({
                        autoScrollLyrics: !settings.autoScrollLyrics,
                      })
                    }
                  />
                }
              />
              <SettingRow
                label={t("settings.keyboardShortcuts")}
                description={t("settings.keyboardShortcutsDescription")}
                control={
                  <Toggle
                    enabled={settings.keyboardShortcuts}
                    onClick={() =>
                      updateSettings({
                        keyboardShortcuts: !settings.keyboardShortcuts,
                      })
                    }
                  />
                }
              />
              <SettingRow
                label={t("settings.seekJumpLength")}
                description={t("settings.seekJumpLengthDescription")}
                control={
                  <div className="flex flex-wrap gap-2">
                    {SEEK_STEP_OPTIONS.map((seconds) => (
                      <ChoiceChip
                        key={seconds}
                        label={`${seconds}s`}
                        selected={settings.seekStepSeconds === seconds}
                        onClick={() =>
                          updateSettings({ seekStepSeconds: seconds })
                        }
                      />
                    ))}
                  </div>
                }
              />
            </Section>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-0 xl:self-start">
            <section className="theme-surface-strong rounded-xl border p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">
                {t("settings.activeSetup")}
              </p>
              <div className="mt-4 space-y-3">
                <div className="theme-surface-soft rounded-xl border p-4">
                  <p className="text-sm text-white/45">
                    {t("settings.playbackSummary")}
                  </p>
                  <p className="mt-1 text-base font-semibold text-white">
                    {autoRetryLabel}
                  </p>
                  <p className="mt-1 text-sm text-white/55">
                    {settings.autoplayRecommendations
                      ? t("settings.recommendationsContinue")
                      : t("settings.playbackStops")}
                  </p>
                </div>
                <div className="theme-surface-soft rounded-xl border p-4">
                  <p className="text-sm text-white/45">
                    {t("settings.searchSummary")}
                  </p>
                  <p className="mt-1 text-base font-semibold text-white">
                    {searchSourceLabels[settings.preferredSearchSource]}
                  </p>
                  <p className="mt-1 text-sm text-white/55">
                    {settings.rememberLastSearch
                      ? t("settings.searchRestores")
                      : t("settings.searchOpensFresh")}
                  </p>
                </div>
                <div className="theme-surface-soft rounded-xl border p-4">
                  <p className="text-sm text-white/45">
                    {t("settings.lyricsControlsSummary")}
                  </p>
                  <p className="mt-1 text-base font-semibold text-white">
                    {settings.lyricsEnabled
                      ? t("settings.lyricsOn")
                      : t("settings.lyricsOff")}
                  </p>
                  <p className="mt-1 text-sm text-white/55">
                    {settings.keyboardShortcuts
                      ? t("settings.shortcutsEnabled", {
                          seconds: settings.seekStepSeconds,
                        })
                      : t("settings.shortcutsDisabled")}
                  </p>
                </div>
                <div className="theme-surface-soft rounded-xl border p-4">
                  <p className="text-sm text-white/45">
                    {t("settings.appearancePerformance")}
                  </p>
                  <p className="mt-1 text-base font-semibold text-white">
                    {themeLabels[settings.theme]}
                  </p>
                  <p className="mt-1 text-sm text-white/55">{motionLabel}</p>
                </div>
              </div>
            </section>

            <section className="theme-surface-strong rounded-xl border p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">
                {t("settings.quickHelp")}
              </p>
              <div className="mt-4 space-y-3 text-sm text-white/58">
                <p>{t("settings.quickHelpShortcuts")}</p>
                <p>{t("settings.quickHelpLyrics")}</p>
                <p>{t("settings.quickHelpThemes")}</p>
                <p>{t("settings.quickHelpReset")}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetSettings();
                  resetAutoRetryPreference();
                }}
                className="theme-button-soft mt-5 w-full rounded-full border px-4 py-3 text-sm font-semibold transition"
              >
                {t("settings.resetDefaults")}
              </button>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
