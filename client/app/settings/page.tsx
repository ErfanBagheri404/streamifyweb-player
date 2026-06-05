"use client";

import type { ReactNode } from "react";
import { useAudio, type AutoRetryPreference } from "../contexts/AudioContext";
import { useSettings } from "../contexts/SettingsContext";
import {
  SEEK_STEP_OPTIONS,
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-8 w-14 items-center rounded-full transition ${
        enabled ? "theme-accent-fill" : "bg-white/12"
      } ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
      aria-pressed={enabled}
    >
      <span
        className={`inline-block h-6 w-6 rounded-full bg-white shadow-[0_3px_10px_rgba(0,0,0,0.25)] transition ${
          enabled ? "translate-x-7" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function ChoiceChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
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
}: {
  label: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div className="theme-surface-soft flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="text-base font-semibold text-white">{label}</p>
        <p className="mt-1 max-w-2xl text-sm text-white/52">{description}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
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
}: {
  currentValue: AutoRetryPreference;
  onChange: (value: AutoRetryPreference) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ChoiceChip
        label="Ask Me"
        selected={currentValue === "unknown"}
        onClick={() => onChange("unknown")}
      />
      <ChoiceChip
        label="Always Retry"
        selected={currentValue === "enabled"}
        onClick={() => onChange("enabled")}
      />
      <ChoiceChip
        label="Never Retry"
        selected={currentValue === "disabled"}
        onClick={() => onChange("disabled")}
      />
    </div>
  );
}

export default function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useSettings();
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
    youtube: "YouTube",
    youtubemusic: "YouTube Music",
    soundcloud: "SoundCloud",
    jiosaavn: "JioSaavn",
  };
  const themeLabels: Record<AppTheme, string> = {
    default: "Default",
    ocean: "Ocean",
    amethyst: "Amethyst",
    sunset: "Sunset",
    forest: "Forest",
    rose: "Rose",
    frost: "Frost",
  };

  const autoRetryLabel =
    autoRetryPreference === "enabled"
      ? "Always retry once"
      : autoRetryPreference === "disabled"
      ? "Never retry automatically"
      : "Ask when playback fails";
  const motionLabel = settings.disableAnimations
    ? "Animations off"
    : "Animations on";
  const searchMemoryLabel = settings.rememberLastSearch
    ? "Search memory on"
    : "Search memory off";

  return (
    <div className="theme-surface-strong relative h-full overflow-y-auto hide-scrollbar rounded-xl text-white">
      <div className="relative space-y-5">
        <section className="theme-surface overflow-hidden rounded-xl border p-5 shadow-[0_30px_80px_rgba(0,0,0,0.28)] md:p-6">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/58">
                <SparkGlyph />
                Personalize Streamify
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-white md:text-5xl">
                Settings
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-white/64 md:text-base">
                Tune playback, lyrics, search, and controls the way a modern
                music app should. Changes save instantly and apply across the
                player.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white/52">
                Auto retry: {autoRetryLabel}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white/52">
                Search: {searchSourceLabels[settings.preferredSearchSource]}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white/52">
                Seek jump: {settings.seekStepSeconds}s
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white/52">
                Theme: {themeLabels[settings.theme]}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white/52">
                Motion: {motionLabel}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white/52">
                Search memory: {searchMemoryLabel}
              </span>
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <Section
              eyebrow="Appearance"
              title="Theme And Motion"
              description="Pick a theme for the app shell and control whether interface animations should run."
            >
              <SettingRow
                label="Theme"
                description="Switch the app between a few dark palettes without changing your saved playback preferences."
                control={
                  <div className="flex flex-wrap gap-2">
                    {(
                      Object.entries(themeLabels) as Array<[AppTheme, string]>
                    ).map(([value, label]) => (
                      <ChoiceChip
                        key={value}
                        label={label}
                        selected={settings.theme === value}
                        onClick={() => updateSettings({ theme: value })}
                      />
                    ))}
                  </div>
                }
              />
              <SettingRow
                label="Disable Animations"
                description="Turn off transitions and motion effects to keep the app lighter on lower-end devices."
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
                label="Show Sidebar Activity"
                description="Keep recent cover shortcuts visible in the left sidebar for faster replays."
                control={
                  <Toggle
                    enabled={settings.showSidebarActivity}
                    onClick={() =>
                      updateSettings({
                        showSidebarActivity: !settings.showSidebarActivity,
                      })
                    }
                  />
                }
              />
            </Section>

            <Section
              eyebrow="Playback"
              title="How music behaves"
              description="These controls affect retry behavior, automatic continuation, and whether Streamify opens the immersive player when tracks begin."
            >
              <SettingRow
                label="Auto Retry Playback"
                description="If a track fails, Streamify can ask first, retry once automatically, or leave playback errors entirely manual."
                control={
                  <AutoRetryValue
                    currentValue={autoRetryPreference}
                    onChange={handleAutoRetryChange}
                  />
                }
              />
              <SettingRow
                label="Autoplay Recommended Tracks"
                description="When your queue ends, Streamify keeps the session going with related songs or recent favorites."
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
                label="Open Now Playing Automatically"
                description="Jump straight into the full-screen player whenever you start a track from search, home, or your library."
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
              eyebrow="Discovery"
              title="Search Preferences"
              description="Set the source Streamify should favor first when you open Search without a saved query or direct URL parameters."
            >
              <SettingRow
                label="Default Search Source"
                description="Choose the catalog you want Search to open with by default."
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
                label="Remember Last Search"
                description="Reopen Search with your last query, source, and filter instead of always starting fresh."
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
              eyebrow="Lyrics & Controls"
              title="Reading And Input"
              description="Shape how the lyrics panel behaves and how quickly keyboard shortcuts move around the track."
            >
              <SettingRow
                label="Lyrics"
                description="Fetch lyrics inside the full-screen player for supported tracks."
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
                label="Auto-Scroll Synced Lyrics"
                description="Keep the active lyric centered as the song plays."
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
                label="Keyboard Shortcuts"
                description="Use Space to play or pause, Left and Right arrows to seek, Up and Down to change volume, and F to toggle Now Playing."
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
                label="Seek Jump Length"
                description="Choose how far forward or backward shortcut-based seeking should move."
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
                Active Setup
              </p>
              <div className="mt-4 space-y-3">
                <div className="theme-surface-soft rounded-xl border p-4">
                  <p className="text-sm text-white/45">Playback</p>
                  <p className="mt-1 text-base font-semibold text-white">
                    {autoRetryLabel}
                  </p>
                  <p className="mt-1 text-sm text-white/55">
                    {settings.autoplayRecommendations
                      ? "Recommendations continue your session"
                      : "Playback stops when your queue ends"}
                  </p>
                </div>
                <div className="theme-surface-soft rounded-xl border p-4">
                  <p className="text-sm text-white/45">Search</p>
                  <p className="mt-1 text-base font-semibold text-white">
                    {searchSourceLabels[settings.preferredSearchSource]}
                  </p>
                  <p className="mt-1 text-sm text-white/55">
                    {settings.rememberLastSearch
                      ? "Search restores your last query when available."
                      : "Search always opens fresh with your preferred source."}
                  </p>
                </div>
                <div className="theme-surface-soft rounded-xl border p-4">
                  <p className="text-sm text-white/45">Lyrics & Controls</p>
                  <p className="mt-1 text-base font-semibold text-white">
                    {settings.lyricsEnabled ? "Lyrics on" : "Lyrics off"}
                  </p>
                  <p className="mt-1 text-sm text-white/55">
                    {settings.keyboardShortcuts
                      ? `Shortcuts enabled with ${settings.seekStepSeconds}s seek jumps`
                      : "Keyboard shortcuts are disabled"}
                  </p>
                </div>
                <div className="theme-surface-soft rounded-xl border p-4">
                  <p className="text-sm text-white/45">Appearance & Performance</p>
                  <p className="mt-1 text-base font-semibold text-white">
                    {themeLabels[settings.theme]}
                  </p>
                  <p className="mt-1 text-sm text-white/55">{motionLabel}</p>
                </div>
                <div className="theme-surface-soft rounded-xl border p-4">
                  <p className="text-sm text-white/45">Sidebar</p>
                  <p className="mt-1 text-base font-semibold text-white">
                    {settings.showSidebarActivity
                      ? "Recent activity visible"
                      : "Recent activity hidden"}
                  </p>
                  <p className="mt-1 text-sm text-white/55">
                    {searchMemoryLabel}
                  </p>
                </div>
              </div>
            </section>

            <section className="theme-surface-strong rounded-xl border p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">
                Quick Help
              </p>
              <div className="mt-4 space-y-3 text-sm text-white/58">
                <p>
                  `Space` toggles play/pause, `Left` and `Right` seek, `Up` and
                  `Down` adjust volume, and `F` opens or closes Now Playing.
                </p>
                <p>
                  Turning off lyrics stops fullscreen lyric fetches immediately.
                </p>
                <p>
                  Themes now change the app shell between Default, Ocean,
                  Amethyst, Sunset, Forest, Rose, and Frost.
                </p>
                <p>
                  Reset restores playback, lyrics, search, theme, and motion
                  preferences to the default Streamify setup.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetSettings();
                  resetAutoRetryPreference();
                }}
                className="theme-button-soft mt-5 w-full rounded-full border px-4 py-3 text-sm font-semibold transition"
              >
                Reset To Defaults
              </button>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
