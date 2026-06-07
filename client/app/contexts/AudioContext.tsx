"use client";

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { useSettings } from "./SettingsContext";
import { formatNumberByLanguage } from "../lib/i18n";

type AudioType = "file" | "hls" | "soundcloud-drm";
type PlaybackStrategy = "audio" | "widget";
export type AutoRetryPreference = "unknown" | "enabled" | "disabled";
const DEFAULT_PLAYBACK_ERROR =
  "Couldn't play this track. Try again or choose another one.";
const AUTO_RETRY_STORAGE_KEY = "streamifyAutoRetryPlayback";
const AUTO_RETRY_MESSAGE = "Auto retry is enabled and retrying...";
const PLAYBACK_PROGRESS_UPDATE_MS = 250;
const PLAYBACK_PROGRESS_MIN_DELTA_SECONDS = 0.2;
const PLAYBACK_DURATION_MIN_DELTA_SECONDS = 0.5;
const MEDIA_SESSION_POSITION_UPDATE_MS = 1000;
const MEDIA_SESSION_POSITION_MIN_DELTA_SECONDS = 1;

export interface Song {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  artistImage?: string;
  artistSource?: string;
  coverUrl?: string;
  audioUrl?: string;
  audioUrls?: string[];
  audioType?: AudioType;
  drmLicenseUrl?: string;
  drmScheme?: string;
  drmProvider?: string;
  drmHeaders?: Record<string, string>;
  duration?: number;
  uploaded?: string;
  cachedAt?: number;
  source?: string;
  url?: string;
  playbackStrategy?: PlaybackStrategy;
  relatedSongs?: Song[];
}

interface PlaybackOptions {
  queue?: Song[];
  currentIndex?: number;
}

interface AudioContextType {
  currentSong: Song | null;
  recentSongs: Song[];
  playbackQueue: Song[];
  queueIndex: number;
  isPlaying: boolean;
  isSongLoading: boolean;
  playbackError: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  isRepeat: boolean;
  beginSongLoad: (song: Song, options?: PlaybackOptions) => void;
  playSong: (song: Song, options?: PlaybackOptions) => void;
  resolveAndPlaySong: (song: Song, options?: PlaybackOptions) => Promise<void>;
  clearSongLoading: () => void;
  pauseSong: () => void;
  resumeSong: () => void;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleRepeat: () => void;
  playNext: () => void;
  playPrevious: () => void;
  playQueueIndex: (index: number) => void;
  isFullscreenOpen: boolean;
  openFullscreen: () => void;
  closeFullscreen: () => void;
  audioRef: React.RefObject<HTMLAudioElement>;
  isPlayerVisible: boolean; // Add this
  autoRetryPreference: AutoRetryPreference;
  showAutoRetryPrompt: boolean;
  isAutoRetrying: boolean;
  autoRetryStatusMessage: string | null;
  enableAutoRetry: () => void;
  disableAutoRetry: () => void;
  resetAutoRetryPreference: () => void;
  dismissAutoRetryPrompt: () => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudio must be used within an AudioProvider");
  }
  return context;
};

interface AudioProviderProps {
  children: ReactNode;
}

interface SoundCloudWidgetProgressEvent {
  currentPosition?: number;
  relativePosition?: number;
  loadProgress?: number;
}

interface SoundCloudWidgetController {
  load: (url: string, options?: Record<string, unknown>) => void;
  bind: (eventName: string, callback: (payload?: unknown) => void) => void;
  unbind: (eventName: string) => void;
  play: () => void;
  pause: () => void;
  seekTo: (milliseconds: number) => void;
  setVolume: (volume: number) => void;
  getPosition: (callback: (milliseconds: number) => void) => void;
  getDuration: (callback: (milliseconds: number) => void) => void;
}

interface SoundCloudWidgetApi {
  Widget: ((iframe: HTMLIFrameElement) => SoundCloudWidgetController) & {
    Events?: Record<string, string>;
  };
}

let soundCloudWidgetApiPromise: Promise<SoundCloudWidgetApi> | null = null;

const DEBUG_SERVER_URL =
  process.env.NEXT_PUBLIC_STREAMIFY_DEBUG_SERVER_URL?.trim() || "";
const DEBUG_SESSION_ID =
  process.env.NEXT_PUBLIC_STREAMIFY_DEBUG_SESSION_ID?.trim() ||
  "chrome-alt-tab-freeze";

function reportDebugEvent(
  runId: string,
  hypothesisId: string,
  location: string,
  msg: string,
  data: Record<string, unknown>
) {
  if (!DEBUG_SERVER_URL) return;
  // #region debug-point H4:client-report-debug-event
  fetch(DEBUG_SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      runId,
      hypothesisId,
      location,
      msg,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

function resolveAudioUrl(audioUrl?: string): string {
  if (!audioUrl) return "";
  if (typeof window === "undefined") return audioUrl;

  try {
    return new URL(audioUrl, window.location.href).toString();
  } catch {
    return audioUrl;
  }
}

async function loadSoundCloudWidgetApi(): Promise<SoundCloudWidgetApi> {
  if (typeof window === "undefined") {
    throw new Error("SoundCloud widget API is only available in the browser");
  }

  const existingWidget = (window as Window & { SC?: SoundCloudWidgetApi }).SC;
  if (existingWidget?.Widget) return existingWidget;

  if (soundCloudWidgetApiPromise) {
    return soundCloudWidgetApiPromise;
  }

  soundCloudWidgetApiPromise = new Promise<SoundCloudWidgetApi>(
    (resolve, reject) => {
      const existingScript = document.getElementById(
        "soundcloud-widget-api"
      ) as HTMLScriptElement | null;

      const handleReady = () => {
        const api = (window as Window & { SC?: SoundCloudWidgetApi }).SC;
        if (api?.Widget) {
          resolve(api);
          return;
        }
        reject(new Error("SoundCloud widget API loaded without SC.Widget"));
      };

      const handleError = () => {
        soundCloudWidgetApiPromise = null;
        reject(new Error("Failed to load SoundCloud widget API"));
      };

      if (existingScript) {
        existingScript.addEventListener("load", handleReady, { once: true });
        existingScript.addEventListener("error", handleError, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = "soundcloud-widget-api";
      script.src = "https://w.soundcloud.com/player/api.js";
      script.async = true;
      script.onload = handleReady;
      script.onerror = handleError;
      document.head.appendChild(script);
    }
  );

  return soundCloudWidgetApiPromise;
}

function buildAudioProxyUrl(audioUrl: string): string {
  return `/api/audio-proxy?url=${encodeURIComponent(audioUrl)}`;
}

function buildLicenseProxyUrl(licenseUrl: string): string {
  return `/api/license-proxy?url=${encodeURIComponent(licenseUrl)}`;
}

function isSoundCloudLicenseUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname;
    return (
      host === "license.media-streaming.soundcloud.cloud" ||
      host === "license.media-streaming.soundcloud.com" ||
      host === "media-streaming.soundcloud.cloud" ||
      host.endsWith(".media-streaming.soundcloud.cloud") ||
      host.endsWith(".media-streaming.soundcloud.com")
    );
  } catch {
    return false;
  }
}

function isYouTubeSource(source?: string): boolean {
  const normalized = (source || "").toLowerCase();
  return normalized === "youtube" || normalized === "youtubemusic";
}

function extractOriginAudioUrl(audioUrl?: string): string | null {
  if (!audioUrl) return null;

  try {
    const resolved = new URL(
      audioUrl,
      typeof window !== "undefined" ? window.location.href : "http://localhost"
    );
    return resolved.searchParams.get("url");
  } catch {
    return null;
  }
}

function inferAudioType(audioUrl?: string, audioType?: AudioType): AudioType {
  if (audioType) return audioType;

  const candidate = extractOriginAudioUrl(audioUrl) || audioUrl || "";
  return /\.m3u8(?:$|\?)/i.test(candidate) ? "hls" : "file";
}

function shouldUseSoundCloudWidget(song?: Song | null): boolean {
  return song?.source === "soundcloud" && song?.playbackStrategy === "widget";
}

function getSoundCloudWidgetTrackUrl(song: Song): string | null {
  if (typeof song.url === "string" && song.url.trim()) {
    return song.url.trim();
  }
  if (typeof song.id === "string" && song.id.trim()) {
    return `https://api.soundcloud.com/tracks/${encodeURIComponent(song.id)}`;
  }
  return null;
}

function buildSoundCloudWidgetBootstrapUrl(trackUrl: string): string {
  // Match the official embed URL closely so the widget drives playback
  // through SoundCloud's own resolve/media/license request chain.
  const params = new URLSearchParams({
    url: trackUrl,
    auto_play: "true",
    show_artwork: "false",
    callback: "true",
  });
  return `https://w.soundcloud.com/player/?${params.toString()}`;
}

function describePlaybackError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const detail =
      record.detail && typeof record.detail === "object"
        ? (record.detail as Record<string, unknown>)
        : null;
    const parts = [
      typeof record.message === "string" ? record.message : null,
      typeof detail?.message === "string" ? detail.message : null,
      typeof record.code === "number" || typeof record.code === "string"
        ? `code ${record.code}`
        : null,
      typeof detail?.code === "number" || typeof detail?.code === "string"
        ? `code ${detail.code}`
        : null,
      typeof detail?.category === "number" ||
      typeof detail?.category === "string"
        ? `category ${detail.category}`
        : null,
    ].filter(Boolean);

    if (parts.length > 0) return parts.join(" | ");

    try {
      return JSON.stringify(error);
    } catch {}
  }

  return String(error);
}

function describeShakaErrorPayload(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") {
    return { raw: String(error) };
  }

  const record = error as Record<string, unknown>;
  const detail =
    record.detail && typeof record.detail === "object"
      ? (record.detail as Record<string, unknown>)
      : null;

  // Shaka uses `category`, `code`, `severity`, `data` directly on the
  // thrown error, but when it comes through an event listener the fields
  // are nested under `event.detail`. Support both.
  const inner =
    (record.innerError && typeof record.innerError === "object"
      ? (record.innerError as Record<string, unknown>)
      : null) ||
    (detail?.innerError && typeof detail.innerError === "object"
      ? (detail.innerError as Record<string, unknown>)
      : null);

  const category =
    typeof record.category === "number" || typeof record.category === "string"
      ? record.category
      : typeof detail?.category === "number" ||
        typeof detail?.category === "string"
      ? detail.category
      : null;

  const severity =
    typeof record.severity === "number" || typeof record.severity === "string"
      ? record.severity
      : typeof detail?.severity === "number" ||
        typeof detail?.severity === "string"
      ? detail.severity
      : null;

  return {
    message:
      typeof record.message === "string"
        ? record.message
        : typeof detail?.message === "string"
        ? detail.message
        : null,
    code:
      typeof record.code === "number" || typeof record.code === "string"
        ? record.code
        : typeof detail?.code === "number" || typeof detail?.code === "string"
        ? detail.code
        : null,
    category,
    severity,
    data:
      Array.isArray(record.data) || typeof record.data === "string"
        ? record.data
        : Array.isArray(detail?.data) || typeof detail?.data === "string"
        ? detail.data
        : null,
    innerError: inner
      ? {
          message: typeof inner.message === "string" ? inner.message : null,
          code:
            typeof inner.code === "number" || typeof inner.code === "string"
              ? inner.code
              : null,
        }
      : null,
  };
}

function shakaErrorMeaning(category: unknown, code: unknown): string {
  if (category === 1) {
    return "manifest/network error";
  }
  if (category === 2) {
    return "manifest parse error";
  }
  if (category === 3) {
    return "manifest-related error";
  }
  if (category === 4) {
    return "media error";
  }
  if (category === 5) {
    return "streaming engine error";
  }
  if (category === 6) {
    if (code === 6001) return "license request failed (CORS/network)";
    if (code === 6002) return "license response malformed";
    if (code === 6003) return "license server timed out";
    if (code === 6004) return "license server rejected key";
    if (code === 6005) return "license server returned a non-success status";
    if (code === 6006) {
      return "license server returned a server certificate (this usually means HTTPS is required for Widevine)";
    }
    return "DRM error";
  }
  if (category === 7) {
    return "player destroyed mid-flight";
  }
  if (category === 8) {
    return "attach failed (check media element compatibility)";
  }
  if (category === 9) {
    return "bad HTTP status on a non-license request";
  }
  if (category === 10) {
    return "configuration error";
  }
  return category == null
    ? "unknown shaka category"
    : `shaka category ${category}`;
}

function normalizeAudioCandidates(song: Song): string[] {
  const candidates = [
    ...(song.audioUrl ? [song.audioUrl] : []),
    ...(Array.isArray(song.audioUrls) ? song.audioUrls : []),
  ].filter(
    (value): value is string =>
      typeof value === "string" && Boolean(value.trim())
  );

  const uniqueCandidates: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const resolved = resolveAudioUrl(candidate);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    uniqueCandidates.push(candidate);
  }

  return uniqueCandidates;
}

function normalizeSong(song: Song): Song {
  return {
    ...song,
    cachedAt: song.cachedAt ?? Date.now(),
  };
}

function normalizeRelatedSongsPayload(
  value: unknown,
  fallbackSource?: string
): Song[] {
  if (!Array.isArray(value)) return [];

  const deduped: Song[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const id =
      typeof record.id === "string" && record.id.trim() ? record.id.trim() : "";
    const title =
      typeof record.title === "string" && record.title.trim()
        ? record.title.trim()
        : "";
    if (!id || !title || seen.has(id)) continue;

    seen.add(id);
    deduped.push(
      normalizeSong({
        id,
        title,
        artist:
          typeof record.artist === "string" && record.artist.trim()
            ? record.artist.trim()
            : "Unknown Artist",
        artistId:
          typeof record.artistId === "string" && record.artistId.trim()
            ? record.artistId.trim()
            : undefined,
        artistImage:
          typeof record.artistImage === "string" && record.artistImage.trim()
            ? record.artistImage
            : undefined,
        coverUrl:
          typeof record.coverUrl === "string" && record.coverUrl.trim()
            ? record.coverUrl
            : undefined,
        uploaded:
          typeof record.uploaded === "string" && record.uploaded.trim()
            ? record.uploaded
            : undefined,
        duration:
          typeof record.duration === "number"
            ? record.duration
            : typeof record.duration === "string"
            ? Number.parseInt(record.duration, 10) || undefined
            : undefined,
        source:
          typeof record.source === "string" && record.source.trim()
            ? record.source
            : fallbackSource,
        url:
          typeof record.url === "string" && record.url.trim()
            ? record.url
            : undefined,
      })
    );
  }

  return deduped;
}

function buildSongArtwork(song: Song): MediaImage[] {
  if (!song.coverUrl) return [];

  return [
    { src: song.coverUrl, sizes: "96x96", type: "image/png" },
    { src: song.coverUrl, sizes: "192x192", type: "image/png" },
    { src: song.coverUrl, sizes: "512x512", type: "image/png" },
  ];
}

function shouldRefreshResolvedAudio(song: Song): boolean {
  const source = (song.source || "").toLowerCase();

  if (isYouTubeSource(song.source)) {
    return true;
  }

  if (source === "soundcloud") {
    return true;
  }

  if (source === "jiosaavn") {
    return false;
  }

  const audioUrl = song.audioUrl || "";
  return (
    audioUrl.includes("videoplayback") ||
    audioUrl.includes("googlevideo.com") ||
    audioUrl.includes("yt.omada.cafe") ||
    audioUrl.includes("invidious") ||
    audioUrl.includes("/api/audio-proxy?url=")
  );
}

export const AudioProvider: React.FC<AudioProviderProps> = ({ children }) => {
  const { settings } = useSettings();
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [recentSongs, setRecentSongs] = useState<Song[]>([]);
  const [playbackQueue, setPlaybackQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSongLoading, setIsSongLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [autoRetryPreference, setAutoRetryPreference] =
    useState<AutoRetryPreference>("unknown");
  const [showAutoRetryPrompt, setShowAutoRetryPrompt] = useState(false);
  const [isAutoRetrying, setIsAutoRetrying] = useState(false);
  const [autoRetryStatusMessage, setAutoRetryStatusMessage] = useState<
    string | null
  >(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const hasHydratedRef = useRef(false);
  const playbackFrameRef = useRef<number | null>(null);
  const soundCloudWidgetProgressIntervalRef = useRef<number | null>(null);
  const autoRetryStatusTimerRef = useRef<number | null>(null);
  const autoRetryInFlightRef = useRef(false);
  const autoRetryAttemptCountRef = useRef<Record<string, number>>({});
  const playbackRequestIdRef = useRef(0);
  const suppressNextPauseEventRef = useRef(false);
  const currentSongRef = useRef<Song | null>(null);
  const recentSongsRef = useRef<Song[]>([]);
  const autoRetryPreferenceRef = useRef<AutoRetryPreference>("unknown");
  const playbackRunIdRef = useRef("pre-fix");
  const isRepeatRef = useRef(false);
  const playbackQueueRef = useRef<Song[]>([]);
  const queueIndexRef = useRef(-1);
  const volumeRef = useRef(1);
  const lastMediaSessionPositionRef = useRef(0);
  const lastMediaSessionPositionUpdateRef = useRef(0);
  const hlsControllerRef = useRef<{ destroy: () => void } | null>(null);
  const hlsSourceRef = useRef<string | null>(null);
  const shakaPlayerRef = useRef<{
    destroy: () => Promise<unknown> | unknown;
  } | null>(null);
  const shakaSourceRef = useRef<string | null>(null);
  const soundCloudWidgetIframeRef = useRef<HTMLIFrameElement>(null);
  const soundCloudWidgetRef = useRef<SoundCloudWidgetController | null>(null);
  const soundCloudWidgetSourceRef = useRef<string | null>(null);
  const soundCloudWidgetReadyRef = useRef(false);
  const shakaInitInFlightRef = useRef<{
    songId: string;
    audioUrl: string;
  } | null>(null);
  const resolveSongForPlaybackRef = useRef<(song: Song) => Promise<Song>>(
    async (song) => normalizeSong(song)
  );
  const playRecommendedSongRef = useRef<(seedSong: Song) => Promise<boolean>>(
    async () => false
  );

  const pauseManagedAudio = useCallback((suppressPauseEvent = false) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (suppressPauseEvent && !audio.paused) {
      suppressNextPauseEventRef.current = true;
    }

    try {
      audio.pause();
    } catch {}
  }, []);

  const syncPlaybackStateFromElement = useCallback(
    (audio: HTMLAudioElement, fallbackDuration?: number) => {
      const nextTime = Number.isFinite(audio.currentTime)
        ? Math.max(0, audio.currentTime)
        : 0;
      const nextDuration = Number.isFinite(audio.duration)
        ? Math.max(0, audio.duration)
        : fallbackDuration || 0;

      setCurrentTime((previous) =>
        Math.abs(previous - nextTime) >= PLAYBACK_PROGRESS_MIN_DELTA_SECONDS
          ? nextTime
          : previous
      );
      setDuration((previous) =>
        Math.abs(previous - nextDuration) >= PLAYBACK_DURATION_MIN_DELTA_SECONDS
          ? nextDuration
          : previous
      );
    },
    []
  );

  const setTransientAutoRetryStatus = useCallback((message: string | null) => {
    if (autoRetryStatusTimerRef.current !== null) {
      window.clearTimeout(autoRetryStatusTimerRef.current);
      autoRetryStatusTimerRef.current = null;
    }

    setAutoRetryStatusMessage(message);

    if (message) {
      autoRetryStatusTimerRef.current = window.setTimeout(() => {
        setAutoRetryStatusMessage(null);
        autoRetryStatusTimerRef.current = null;
      }, 2400);
    }
  }, []);

  const clearAutoRetryState = useCallback(() => {
    autoRetryInFlightRef.current = false;
    setIsAutoRetrying(false);
  }, []);

  const createPlaybackRequest = () => {
    playbackRequestIdRef.current += 1;
    return playbackRequestIdRef.current;
  };

  const isPlaybackRequestCurrent = (requestId: number) =>
    playbackRequestIdRef.current === requestId;

  const enableAutoRetry = useCallback(() => {
    autoRetryPreferenceRef.current = "enabled";
    setAutoRetryPreference("enabled");
    setShowAutoRetryPrompt(false);
    if (playbackError && currentSongRef.current) {
      scheduleAutoRetry(currentSongRef.current, "user-enabled-auto-retry");
    }
  }, [playbackError]);

  const disableAutoRetry = useCallback(() => {
    autoRetryPreferenceRef.current = "disabled";
    setAutoRetryPreference("disabled");
    setShowAutoRetryPrompt(false);
  }, []);

  const resetAutoRetryPreference = useCallback(() => {
    autoRetryPreferenceRef.current = "unknown";
    setAutoRetryPreference("unknown");
    setShowAutoRetryPrompt(false);
    setTransientAutoRetryStatus(null);
  }, [setTransientAutoRetryStatus]);

  const dismissAutoRetryPrompt = useCallback(() => {
    setShowAutoRetryPrompt(false);
  }, []);

  function scheduleAutoRetry(song: Song | null, reason: string): boolean {
    if (!song) return false;

    if (autoRetryPreferenceRef.current === "unknown") {
      setShowAutoRetryPrompt(true);
      return false;
    }

    if (autoRetryPreferenceRef.current !== "enabled") {
      return false;
    }

    const attempts = autoRetryAttemptCountRef.current[song.id] ?? 0;
    if (attempts >= 1 || autoRetryInFlightRef.current) {
      return false;
    }

    autoRetryAttemptCountRef.current[song.id] = attempts + 1;
    autoRetryInFlightRef.current = true;
    setShowAutoRetryPrompt(false);
    setIsAutoRetrying(true);
    setPlaybackError(null);
    setTransientAutoRetryStatus(AUTO_RETRY_MESSAGE);

    window.setTimeout(() => {
      const activeSong = currentSongRef.current;
      if (!activeSong || activeSong.id !== song.id) {
        clearAutoRetryState();
        return;
      }

      const queue = playbackQueueRef.current;
      const nextOptions =
        queue.length > 0 && queueIndexRef.current >= 0
          ? { queue, currentIndex: queueIndexRef.current }
          : undefined;
      const retrySong = shouldRefreshResolvedAudio(activeSong)
        ? {
            ...activeSong,
            audioUrl: undefined,
            audioUrls: undefined,
            audioType: undefined,
          }
        : activeSong;

      void resolveAndPlaySong(retrySong, nextOptions)
        .catch((error) => {
          console.error(`Auto retry failed after ${reason}:`, error);
        })
        .finally(() => {
          clearAutoRetryState();
        });
    }, 900);

    return true;
  }

  const tryNextAudioCandidate = (
    song: Song | null,
    reason: string,
    failedAudioUrl?: string
  ): boolean => {
    if (!song || !isYouTubeSource(song.source)) return false;

    const candidates = normalizeAudioCandidates(song);
    if (candidates.length < 2) return false;

    const failedResolved = resolveAudioUrl(failedAudioUrl || song.audioUrl);
    const currentIndex = candidates.findIndex(
      (candidate) => resolveAudioUrl(candidate) === failedResolved
    );
    const nextCandidates = candidates.slice(
      currentIndex >= 0 ? currentIndex + 1 : 1
    );
    if (nextCandidates.length === 0) return false;

    const nextAudioUrl = nextCandidates[0];
    if (!nextAudioUrl) return false;

    reportDebugEvent(
      playbackRunIdRef.current,
      "H4",
      "app/contexts/AudioContext.tsx:audio-fallback:advance",
      "[DEBUG] playback audio fallback advanced",
      {
        songId: song.id,
        source: song.source || null,
        reason,
        failedAudioUrl: failedAudioUrl || song.audioUrl || null,
        nextAudioUrl,
        remainingCandidates: nextCandidates.length,
      }
    );

    setCurrentSong((prev) =>
      prev && prev.id === song.id
        ? {
            ...prev,
            audioUrl: nextAudioUrl,
            audioUrls: nextCandidates,
          }
        : prev
    );
    setPlaybackError(null);
    setIsSongLoading(true);
    setIsPlaying(true);
    return true;
  };

  const syncSoundCloudWidgetProgress = useCallback(
    (fallbackDuration?: number) => {
      const widget = soundCloudWidgetRef.current;
      if (!widget) return;

      widget.getPosition((milliseconds) => {
        if (!Number.isFinite(milliseconds)) return;
        setCurrentTime(Math.max(0, milliseconds / 1000));
      });

      widget.getDuration((milliseconds) => {
        if (!Number.isFinite(milliseconds)) return;
        const seconds = Math.max(0, milliseconds / 1000);
        setDuration(seconds || fallbackDuration || 0);
      });
    },
    []
  );

  const destroyHlsPlayback = () => {
    hlsControllerRef.current?.destroy();
    hlsControllerRef.current = null;
    hlsSourceRef.current = null;
  };

  const destroyShakaPlayback = () => {
    const player = shakaPlayerRef.current;
    shakaPlayerRef.current = null;
    shakaSourceRef.current = null;
    if (!player) return;
    void player.destroy();
  };

  const destroySoundCloudWidgetPlayback = () => {
    const widget = soundCloudWidgetRef.current;
    // #region debug-point C:widget-destroy
    reportDebugEvent(
      playbackRunIdRef.current,
      "C",
      "app/contexts/AudioContext.tsx:destroySoundCloudWidgetPlayback",
      "[DEBUG] SoundCloud widget playback destroyed",
      {
        hadWidget: Boolean(widget),
        widgetSource: soundCloudWidgetSourceRef.current,
        widgetReady: soundCloudWidgetReadyRef.current,
        iframeSrc: soundCloudWidgetIframeRef.current?.src || null,
      }
    );
    // #endregion
    soundCloudWidgetRef.current = null;
    soundCloudWidgetSourceRef.current = null;
    soundCloudWidgetReadyRef.current = false;
    if (widget) {
      try {
        widget.pause();
      } catch {}
    }
    const iframe = soundCloudWidgetIframeRef.current;
    if (iframe) {
      iframe.src = "about:blank";
    }
  };

  const destroyManagedPlayback = () => {
    destroyHlsPlayback();
    destroyShakaPlayback();
  };

  const attemptAudioPlay = (
    audio: HTMLAudioElement,
    song: Song,
    requestId = playbackRequestIdRef.current
  ) => {
    const playPromise = audio.play();
    if (playPromise === undefined) return;

    playPromise.catch((error: Error & { name?: string }) => {
      if (error.name === "AbortError") return;
      if (
        !isPlaybackRequestCurrent(requestId) ||
        currentSongRef.current?.id !== song.id
      ) {
        return;
      }
      if (
        tryNextAudioCandidate(
          song,
          "play-rejected",
          audio.currentSrc || audio.src || song.audioUrl
        )
      ) {
        return;
      }

      reportDebugEvent(
        playbackRunIdRef.current,
        "H1",
        "app/contexts/AudioContext.tsx:playback-effect:play-rejected",
        "[DEBUG] audio.play() rejected",
        {
          songId: song.id,
          source: song.source || null,
          errorName: error.name || null,
          errorMessage: error.message,
          currentSrc: audio.currentSrc || audio.src || null,
          networkState: audio.networkState,
          readyState: audio.readyState,
        }
      );

      setPlaybackError(DEFAULT_PLAYBACK_ERROR);
      console.error("Error playing audio:", error);
      setIsPlaying(false);
    });
  };

  // Load saved state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem("audioPlayerState");
    const savedAutoRetryPreference = localStorage.getItem(
      AUTO_RETRY_STORAGE_KEY
    );
    if (
      savedAutoRetryPreference === "enabled" ||
      savedAutoRetryPreference === "disabled"
    ) {
      setAutoRetryPreference(savedAutoRetryPreference);
    }

    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        const savedRecentSongs = Array.isArray(state.recentSongs)
          ? state.recentSongs
          : state.currentSong
          ? [state.currentSong]
          : [];

        setRecentSongs(savedRecentSongs);

        if (state.currentSong) {
          const hydratedSong = normalizeSong(state.currentSong as Song);
          setCurrentSong(hydratedSong);
          setPlaybackQueue([hydratedSong]);
          setQueueIndex(0);
          setCurrentTime(state.currentTime || 0);
          setDuration(state.duration || 0);
          setVolumeState(state.volume || 1);
          setIsRepeat(state.isRepeat || false);
          setIsPlaying(Boolean(state.isPlaying));
        }
      } catch (error) {
        console.error("Error loading audio player state:", error);
      } finally {
        hasHydratedRef.current = true;
      }
    } else {
      hasHydratedRef.current = true;
    }
  }, []);

  // Save state to localStorage when it changes
  useEffect(() => {
    if (!hasHydratedRef.current) return;

    const state = {
      currentSong,
      recentSongs,
      currentTime,
      duration,
      volume,
      isRepeat,
      isPlaying,
      isSongLoading: false,
    };
    localStorage.setItem("audioPlayerState", JSON.stringify(state));
  }, [
    currentSong,
    recentSongs,
    currentTime,
    duration,
    volume,
    isRepeat,
    isPlaying,
  ]);

  useEffect(
    () => () => {
      if (autoRetryStatusTimerRef.current !== null) {
        window.clearTimeout(autoRetryStatusTimerRef.current);
      }
      destroyManagedPlayback();
      destroySoundCloudWidgetPlayback();
    },
    []
  );

  useEffect(() => {
    isRepeatRef.current = isRepeat;
  }, [isRepeat]);

  useEffect(() => {
    playbackQueueRef.current = playbackQueue;
  }, [playbackQueue]);

  useEffect(() => {
    queueIndexRef.current = queueIndex;
  }, [queueIndex]);

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  useEffect(() => {
    recentSongsRef.current = recentSongs;
  }, [recentSongs]);

  useEffect(() => {
    autoRetryPreferenceRef.current = autoRetryPreference;
    localStorage.setItem(AUTO_RETRY_STORAGE_KEY, autoRetryPreference);
  }, [autoRetryPreference]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    if (!currentSong) {
      autoRetryAttemptCountRef.current = {};
      clearAutoRetryState();
      setShowAutoRetryPrompt(false);
      return;
    }

    autoRetryAttemptCountRef.current[currentSong.id] ??= 0;
  }, [clearAutoRetryState, currentSong]);

  useEffect(() => {
    if (!playbackError || !currentSong || isSongLoading) return;
    scheduleAutoRetry(currentSong, "playback-error");
  }, [currentSong, isSongLoading, playbackError]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const emitWindowState = (reason: string) => {
      // #region debug-point H3:window-lifecycle
      reportDebugEvent(
        playbackRunIdRef.current,
        "H3",
        "app/contexts/AudioContext.tsx:window-lifecycle",
        "[DEBUG] window lifecycle signal",
        {
          reason,
          songId: currentSongRef.current?.id || null,
          isPlaying: !audioRef.current?.paused && !audioRef.current?.ended,
          stateIsPlaying: isPlaying,
          isSongLoading,
          isFullscreenOpen,
          hasFocus:
            typeof document.hasFocus === "function"
              ? document.hasFocus()
              : null,
          hidden: document.hidden,
          visibilityState: document.visibilityState,
          playbackError,
          showAutoRetryPrompt,
          autoRetryStatusMessage,
        }
      );
      // #endregion
    };

    const handleVisibilityChange = () => emitWindowState("visibilitychange");
    const handleFocus = () => emitWindowState("focus");
    const handleBlur = () => emitWindowState("blur");
    const handlePageHide = () => emitWindowState("pagehide");
    const handlePageShow = () => emitWindowState("pageshow");

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);

    emitWindowState("effect-mounted");

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [
    autoRetryStatusMessage,
    isFullscreenOpen,
    isPlaying,
    isSongLoading,
    playbackError,
    showAutoRetryPrompt,
  ]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const needsCrossOrigin =
      (currentSong?.audioType ?? "file") !== "soundcloud-drm";
    const currentCrossOrigin = audio.getAttribute("crossorigin");
    const desiredCrossOrigin = needsCrossOrigin ? "anonymous" : null;
    if (currentCrossOrigin !== desiredCrossOrigin) {
      if (needsCrossOrigin) {
        audio.setAttribute("crossorigin", "anonymous");
      } else {
        audio.removeAttribute("crossorigin");
      }
      console.log(
        "[AudioContext] crossOrigin attribute updated",
        JSON.stringify({
          source: currentSong?.source || null,
          audioType: currentSong?.audioType || null,
          crossOrigin: audio.getAttribute("crossorigin"),
        })
      );
    }
  }, [currentSong?.audioType, currentSong?.source]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) {
      destroyManagedPlayback();
      destroySoundCloudWidgetPlayback();
      if (isPlaying) setIsPlaying(false);
      return;
    }

    const usesSoundCloudWidget = shouldUseSoundCloudWidget(currentSong);
    const soundCloudWidgetTrackUrl = usesSoundCloudWidget
      ? getSoundCloudWidgetTrackUrl(currentSong)
      : null;
    const nextAudioUrl = resolveAudioUrl(currentSong.audioUrl);
    const nextAudioType = inferAudioType(
      currentSong.audioUrl,
      currentSong.audioType
    );
    let cancelled = false;
    const requestId = playbackRequestIdRef.current;

    const handleWidgetFinish = () => {
      if (isRepeatRef.current) {
        const widget = soundCloudWidgetRef.current;
        if (widget) {
          try {
            widget.seekTo(0);
            widget.play();
          } catch (error) {
            console.error("Error repeating SoundCloud widget audio:", error);
          }
        }
        return;
      }

      // Tear down the finished widget immediately so it cannot restart
      // while the next queued track is still being resolved.
      destroySoundCloudWidgetPlayback();

      const queuedSongs = playbackQueueRef.current;
      const activeQueueIndex = queueIndexRef.current;
      if (
        queuedSongs.length > 0 &&
        activeQueueIndex >= 0 &&
        activeQueueIndex < queuedSongs.length - 1
      ) {
        const nextQueueIndex = activeQueueIndex + 1;
        const nextSong = queuedSongs[nextQueueIndex];
        if (!nextSong) return;

        setIsPlaying(false);
        setCurrentTime(0);
        setIsSongLoading(true);

        void resolveSongForPlayback(nextSong)
          .then((resolvedSong) => {
            setPlaybackQueue((previousQueue) => {
              const nextQueue = previousQueue.map((entry) =>
                normalizeSong(entry)
              );
              if (nextQueue[nextQueueIndex]) {
                nextQueue[nextQueueIndex] = {
                  ...nextQueue[nextQueueIndex],
                  ...resolvedSong,
                };
              }
              return nextQueue;
            });
            setQueueIndex(nextQueueIndex);
            setCurrentSong(resolvedSong);
            setDuration(resolvedSong.duration || 0);
            setPlaybackError(null);
            setIsSongLoading(false);
            setIsPlaying(true);
          })
          .catch((error) => {
            console.error(
              "Error resolving next SoundCloud widget song:",
              error
            );
            setPlaybackError(
              error instanceof Error ? error.message : DEFAULT_PLAYBACK_ERROR
            );
            setIsSongLoading(false);
            setIsPlaying(false);
            setCurrentTime(0);
          });
        return;
      }

      void playRecommendedSongRef
        .current(currentSong)
        .then((didPlayRecommendation) => {
          if (!didPlayRecommendation) {
            setIsPlaying(false);
            setCurrentTime(0);
          }
        });
    };

    const configureSoundCloudWidgetPlayback = async () => {
      // #region debug-point B:widget-configure-start
      reportDebugEvent(
        playbackRunIdRef.current,
        "B",
        "app/contexts/AudioContext.tsx:configureSoundCloudWidgetPlayback:start",
        "[DEBUG] SoundCloud widget configure started",
        {
          songId: currentSong.id,
          trackUrl: soundCloudWidgetTrackUrl,
          isPlaying,
          widgetSourceRef: soundCloudWidgetSourceRef.current,
          widgetReadyRef: soundCloudWidgetReadyRef.current,
        }
      );
      // #endregion
      const api = await loadSoundCloudWidgetApi();
      if (cancelled) return;

      const iframe = soundCloudWidgetIframeRef.current;
      if (!iframe) {
        throw new Error("SoundCloud widget iframe is unavailable");
      }

      const widgetBootstrapUrl = buildSoundCloudWidgetBootstrapUrl(
        soundCloudWidgetTrackUrl as string
      );
      if (iframe.src !== widgetBootstrapUrl) {
        iframe.src = widgetBootstrapUrl;
        await new Promise<void>((resolve) => {
          const handleLoad = () => {
            iframe.removeEventListener("load", handleLoad);
            resolve();
          };
          iframe.addEventListener("load", handleLoad);
        });
        if (cancelled) return;
      }

      const widget = soundCloudWidgetRef.current || api.Widget(iframe);
      soundCloudWidgetRef.current = widget;
      soundCloudWidgetRef.current = widget;

      const eventNames = api.Widget.Events || {};
      const READY = eventNames.READY || "ready";
      const PLAY = eventNames.PLAY || "play";
      const PAUSE = eventNames.PAUSE || "pause";
      const PLAY_PROGRESS = eventNames.PLAY_PROGRESS || "playProgress";
      const LOAD_PROGRESS = eventNames.LOAD_PROGRESS || "loadProgress";
      const FINISH = eventNames.FINISH || "finish";
      const ERROR = eventNames.ERROR || "error";

      widget.unbind(READY);
      widget.unbind(PLAY);
      widget.unbind(PAUSE);
      widget.unbind(PLAY_PROGRESS);
      widget.unbind(LOAD_PROGRESS);
      widget.unbind(FINISH);
      widget.unbind(ERROR);

      widget.bind(READY, () => {
        // #region debug-point B:widget-ready
        reportDebugEvent(
          playbackRunIdRef.current,
          "B",
          "app/contexts/AudioContext.tsx:configureSoundCloudWidgetPlayback:ready",
          "[DEBUG] SoundCloud widget READY event fired",
          {
            songId: currentSong.id,
            trackUrl: soundCloudWidgetTrackUrl,
            isPlaying,
          }
        );
        // #endregion
        if (cancelled) return;
        soundCloudWidgetReadyRef.current = true;
        setPlaybackError(null);
        setIsSongLoading(false);
        widget.setVolume(Math.round(volumeRef.current * 100));
        syncSoundCloudWidgetProgress(currentSong.duration);
        if (isPlaying) {
          widget.play();
        }
      });

      widget.bind(PLAY, () => {
        // #region debug-point D:widget-play
        reportDebugEvent(
          playbackRunIdRef.current,
          "D",
          "app/contexts/AudioContext.tsx:configureSoundCloudWidgetPlayback:play",
          "[DEBUG] SoundCloud widget PLAY event fired",
          {
            songId: currentSong.id,
            trackUrl: soundCloudWidgetTrackUrl,
          }
        );
        // #endregion
        if (cancelled) return;
        setPlaybackError(null);
        setIsPlaying(true);
        setIsSongLoading(false);
        syncSoundCloudWidgetProgress(currentSong.duration);
      });

      widget.bind(PAUSE, () => {
        // #region debug-point D:widget-pause
        reportDebugEvent(
          playbackRunIdRef.current,
          "D",
          "app/contexts/AudioContext.tsx:configureSoundCloudWidgetPlayback:pause",
          "[DEBUG] SoundCloud widget PAUSE event fired",
          {
            songId: currentSong.id,
            trackUrl: soundCloudWidgetTrackUrl,
          }
        );
        // #endregion
        if (cancelled) return;
        setIsPlaying(false);
        syncSoundCloudWidgetProgress(currentSong.duration);
      });

      widget.bind(PLAY_PROGRESS, (payload) => {
        if (cancelled) return;
        const progress = (payload || {}) as SoundCloudWidgetProgressEvent;
        if (typeof progress.currentPosition === "number") {
          setCurrentTime(Math.max(0, progress.currentPosition / 1000));
        } else {
          syncSoundCloudWidgetProgress(currentSong.duration);
        }
      });

      widget.bind(LOAD_PROGRESS, () => {
        if (cancelled) return;
        syncSoundCloudWidgetProgress(currentSong.duration);
      });

      widget.bind(FINISH, () => {
        if (cancelled) return;
        handleWidgetFinish();
      });

      widget.bind(ERROR, () => {
        // #region debug-point E:widget-error
        reportDebugEvent(
          playbackRunIdRef.current,
          "E",
          "app/contexts/AudioContext.tsx:configureSoundCloudWidgetPlayback:error",
          "[DEBUG] SoundCloud widget ERROR event fired",
          {
            songId: currentSong.id,
            trackUrl: soundCloudWidgetTrackUrl,
            widgetSourceRef: soundCloudWidgetSourceRef.current,
            widgetReadyRef: soundCloudWidgetReadyRef.current,
          }
        );
        // #endregion
        if (cancelled) return;
        setPlaybackError(DEFAULT_PLAYBACK_ERROR);
        setIsSongLoading(false);
        setIsPlaying(false);
      });

      widget.setVolume(Math.round(volumeRef.current * 100));

      if (soundCloudWidgetSourceRef.current !== soundCloudWidgetTrackUrl) {
        // #region debug-point A:widget-load-call
        reportDebugEvent(
          playbackRunIdRef.current,
          "A",
          "app/contexts/AudioContext.tsx:configureSoundCloudWidgetPlayback:load",
          "[DEBUG] SoundCloud widget load invoked",
          {
            songId: currentSong.id,
            trackUrl: soundCloudWidgetTrackUrl,
            isPlaying,
            previousWidgetSource: soundCloudWidgetSourceRef.current,
          }
        );
        // #endregion
        soundCloudWidgetReadyRef.current = false;
        soundCloudWidgetSourceRef.current = soundCloudWidgetTrackUrl;
        setCurrentTime(0);
        setDuration(currentSong.duration || 0);
        setPlaybackError(null);
        setIsSongLoading(true);
        widget.load(soundCloudWidgetTrackUrl as string, {
          auto_play: isPlaying,
          show_artwork: false,
          callback: true,
        });
        return;
      }

      if (soundCloudWidgetReadyRef.current) {
        syncSoundCloudWidgetProgress(currentSong.duration);
        if (isPlaying) {
          widget.play();
        } else {
          widget.pause();
        }
      }
    };

    if (usesSoundCloudWidget) {
      // #region debug-point A:widget-branch-enter
      reportDebugEvent(
        playbackRunIdRef.current,
        "A",
        "app/contexts/AudioContext.tsx:playback-effect:widget-branch-enter",
        "[DEBUG] SoundCloud widget branch entered",
        {
          songId: currentSong.id,
          source: currentSong.source || null,
          trackUrl: soundCloudWidgetTrackUrl,
          playbackStrategy: currentSong.playbackStrategy || null,
          isPlaying,
          widgetSourceRef: soundCloudWidgetSourceRef.current,
          widgetReadyRef: soundCloudWidgetReadyRef.current,
          audioUrl: currentSong.audioUrl || null,
        }
      );
      // #endregion
      if (!soundCloudWidgetTrackUrl) {
        setPlaybackError("This SoundCloud track couldn't be loaded.");
        setIsSongLoading(false);
        setIsPlaying(false);
        return;
      }

      destroyManagedPlayback();
      pauseManagedAudio(true);
      try {
        audio.removeAttribute("src");
        audio.load();
      } catch {}

      void configureSoundCloudWidgetPlayback().catch((error) => {
        // #region debug-point E:widget-configure-catch
        reportDebugEvent(
          playbackRunIdRef.current,
          "E",
          "app/contexts/AudioContext.tsx:playback-effect:widget-catch",
          "[DEBUG] SoundCloud widget configure rejected",
          {
            songId: currentSong.id,
            trackUrl: soundCloudWidgetTrackUrl,
            error: error instanceof Error ? error.message : String(error),
          }
        );
        // #endregion
        console.error("Error initializing SoundCloud widget playback:", error);
        setPlaybackError(
          error instanceof Error ? error.message : DEFAULT_PLAYBACK_ERROR
        );
        setIsSongLoading(false);
        setIsPlaying(false);
      });

      return () => {
        cancelled = true;
      };
    }

    destroySoundCloudWidgetPlayback();

    if (!nextAudioUrl) {
      if (isSongLoading) {
        return;
      }
      // #region debug-point H4:audio-missing-url
      reportDebugEvent(
        playbackRunIdRef.current,
        "H4",
        "app/contexts/AudioContext.tsx:playback-effect:missing-audio-url",
        "[DEBUG] playback effect missing audio url",
        {
          songId: currentSong.id,
          source: currentSong.source || null,
          hasAudioUrl: Boolean(currentSong.audioUrl),
        }
      );
      // #endregion
      setPlaybackError(DEFAULT_PLAYBACK_ERROR);
      setIsPlaying(false);
      return;
    }

    const configureHlsPlayback = async () => {
      const HlsModule = await import("hls.js");
      const Hls = HlsModule.default;

      if (cancelled) return;

      if (!Hls.isSupported()) {
        audio.src = nextAudioUrl;
        audio.load();
        if (isPlaying) attemptAudioPlay(audio, currentSong);
        return;
      }

      destroyHlsPlayback();

      reportDebugEvent(
        playbackRunIdRef.current,
        "H4",
        "app/contexts/AudioContext.tsx:playback-effect:set-hls-src",
        "[DEBUG] playback audio HLS source initialized",
        {
          songId: currentSong.id,
          source: currentSong.source || null,
          audioUrl: nextAudioUrl,
        }
      );

      const hls = new Hls({
        enableWorker: true,
      });
      hlsControllerRef.current = hls;
      hlsSourceRef.current = nextAudioUrl;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setPlaybackError(null);
        setDuration(audio.duration || currentSong.duration || 0);
        setIsSongLoading(false);
        if (!cancelled && isPlaying) {
          attemptAudioPlay(audio, currentSong);
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data?.fatal) return;
        if (
          tryNextAudioCandidate(
            currentSong,
            "hls-fatal-error",
            audio.currentSrc || audio.src || currentSong.audioUrl
          )
        ) {
          return;
        }

        reportDebugEvent(
          playbackRunIdRef.current,
          "H1",
          "app/contexts/AudioContext.tsx:playback-effect:hls-error",
          "[DEBUG] HLS playback error",
          {
            songId: currentSong.id,
            source: currentSong.source || null,
            audioUrl: nextAudioUrl,
            errorType: data.type || null,
            errorDetails: data.details || null,
          }
        );

        setPlaybackError(DEFAULT_PLAYBACK_ERROR);
        setIsSongLoading(false);
        setIsPlaying(false);
        destroyHlsPlayback();
      });

      hls.loadSource(nextAudioUrl);
      hls.attachMedia(audio);
    };

    const configureSoundCloudDrmPlayback = async () => {
      const shakaModule = (await import("shaka-player")) as Record<
        string,
        unknown
      >;
      const shaka = shakaModule as {
        Player: {
          new (media?: HTMLMediaElement): {
            configure: (config: unknown) => void;
            load: (uri: string) => Promise<void>;
            attach: (media: HTMLMediaElement) => Promise<void>;
            detach: () => Promise<void>;
            addEventListener: (
              type: string,
              listener: (event: unknown) => void
            ) => void;
            getNetworkingEngine?: () => {
              registerRequestFilter?: (
                filter: (
                  type: number,
                  request: { headers: Record<string, string>; uris: string[] }
                ) => void
              ) => void;
              registerResponseFilter?: (
                filter: (
                  type: number,
                  response: {
                    status?: number;
                    headers: Record<string, string>;
                    data?: ArrayBuffer;
                  }
                ) => void
              ) => void;
            } | null;
            isLive?: () => boolean;
            destroy: () => Promise<unknown>;
          };
          isBrowserSupported?: () => boolean;
        };
        polyfill?: { installAll?: () => void };
        net?: {
          NetworkingEngine?: {
            RequestType?: Record<string, number>;
          };
        };
        log?: {
          setLevel?: (level: number) => void;
          Level?: {
            DEBUG?: number;
            INFO?: number;
            WARNING?: number;
            ERROR?: number;
          };
        };
        util?: {
          Error?: unknown;
        };
      };

      if (cancelled) return;

      shaka.polyfill?.installAll?.();

      if (shaka.log?.setLevel && shaka.log.Level) {
        try {
          shaka.log.setLevel(shaka.log.Level.DEBUG ?? 0);
        } catch {}
      }

      console.log(
        "[SoundCloud DRM] Shaka Player initializing",
        JSON.stringify({
          hasLog: Boolean(shaka.log),
          hasPolyfill: Boolean(shaka.polyfill),
          hasNet: Boolean(shaka.net),
          hasRequestType: Boolean(shaka.net?.NetworkingEngine?.RequestType),
          browserSupported:
            typeof shaka.Player?.isBrowserSupported === "function"
              ? shaka.Player.isBrowserSupported()
              : "unknown",
          isSecureContext:
            typeof window !== "undefined" ? window.isSecureContext : null,
          locationProtocol:
            typeof window !== "undefined" ? window.location.protocol : null,
          hasMediaSource:
            typeof window !== "undefined" &&
            ("MediaSource" in window || "ManagedMediaSource" in window),
        })
      );

      if (!shaka.Player?.isBrowserSupported?.()) {
        throw new Error(
          "Encrypted SoundCloud playback is not supported in this browser"
        );
      }

      if (!currentSong.drmLicenseUrl || !currentSong.drmScheme) {
        throw new Error("Missing SoundCloud DRM license metadata");
      }

      destroyManagedPlayback();

      // Prefer the manifest served through our own audio-proxy so that we
      // can attach SoundCloud-specific headers and avoid CORS rejections on
      // the manifest fetch (segments still come from upstream).
      // The cache-buster forces Shaka to fetch a freshly-rewritten manifest
      // on every play, so the #EXT-X-KEY URI always points at the current
      // license-proxy implementation and not a stale cached rewrite.
      const soundCloudManifestUrl = resolveAudioUrl(
        buildAudioProxyUrl(nextAudioUrl) + `&_ts=${Date.now()}`
      );

      // The Widevine license server rejects CORS preflights from the
      // browser's CDM, so we route the license URL through our own
      // /api/license-proxy which forwards the request server-to-server.
      const upstreamLicenseUrl = currentSong.drmLicenseUrl;
      const proxiedLicenseUrl = resolveAudioUrl(
        isSoundCloudLicenseUrl(upstreamLicenseUrl)
          ? buildLicenseProxyUrl(upstreamLicenseUrl)
          : upstreamLicenseUrl
      );

      console.log(
        "[SoundCloud DRM] DRM configuration",
        JSON.stringify({
          songId: currentSong.id,
          drmScheme: currentSong.drmScheme,
          manifestUrl: soundCloudManifestUrl,
          licenseUrl: proxiedLicenseUrl,
          proxiedLicense: proxiedLicenseUrl !== upstreamLicenseUrl,
        })
      );

      reportDebugEvent(
        playbackRunIdRef.current,
        "H4",
        "app/contexts/AudioContext.tsx:playback-effect:set-soundcloud-drm-src",
        "[DEBUG] playback SoundCloud DRM source initialized",
        {
          songId: currentSong.id,
          source: currentSong.source || null,
          audioUrl: nextAudioUrl,
          manifestUrl: soundCloudManifestUrl,
          licenseUrl: proxiedLicenseUrl,
          drmScheme: currentSong.drmScheme,
        }
      );

      const player = new shaka.Player();
      shakaPlayerRef.current = player;
      shakaSourceRef.current = nextAudioUrl;

      const licenseRequestType =
        shaka.net?.NetworkingEngine?.RequestType?.LICENSE;
      console.log(
        "[SoundCloud DRM] Request types",
        JSON.stringify({
          licenseRequestType,
          knownTypes: shaka.net?.NetworkingEngine?.RequestType || null,
        })
      );

      const net = player.getNetworkingEngine?.();
      if (net) {
        if (typeof net.registerRequestFilter === "function") {
          net.registerRequestFilter((type, request) => {
            // #region debug-point H4:soundcloud-license-request
            reportDebugEvent(
              playbackRunIdRef.current,
              "H4",
              "app/contexts/AudioContext.tsx:playback-effect:soundcloud-license-request",
              "[DEBUG] SoundCloud DRM request intercepted",
              {
                songId: currentSong.id,
                source: currentSong.source || null,
                requestType: type,
                isLicenseRequest:
                  licenseRequestType != null
                    ? type === licenseRequestType
                    : null,
                requestHeaderKeys: Object.keys(request.headers || {}),
                uris: request.uris,
              }
            );
            // #endregion

            if (!request.headers) request.headers = {};
            request.headers["Referer"] = "https://soundcloud.com/";
            request.headers["Origin"] = "https://soundcloud.com";
            request.headers["User-Agent"] =
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

            if (
              licenseRequestType != null &&
              type === licenseRequestType &&
              currentSong.drmHeaders
            ) {
              Object.assign(request.headers, currentSong.drmHeaders);
            }
          });
        }
        if (typeof net.registerResponseFilter === "function") {
          net.registerResponseFilter((type, response) => {
            reportDebugEvent(
              playbackRunIdRef.current,
              "H4",
              "app/contexts/AudioContext.tsx:playback-effect:soundcloud-license-response",
              "[DEBUG] SoundCloud DRM response intercepted",
              {
                songId: currentSong.id,
                source: currentSong.source || null,
                requestType: type,
                status: response.status ?? null,
                headerKeys: Object.keys(response.headers || {}),
                dataByteLength:
                  response.data instanceof ArrayBuffer
                    ? response.data.byteLength
                    : null,
              }
            );
          });
        }
      } else {
        console.warn(
          "[SoundCloud DRM] Networking engine unavailable; filters skipped"
        );
      }

      // Hook EVERY useful Shaka event so that we can see in the console
      // exactly where the pipeline gets stuck when the user reports an issue.
      const trackedEvents = [
        "loading",
        "loaded",
        "unloading",
        "buffering",
        "buffered",
        "playing",
        "pause",
        "seeked",
        "seeking",
        "stalled",
        "rebuffering",
        "adaptation",
        "variantchanged",
        "emsg",
        "drmsessionupdate",
        "timelineregionenter",
        "timelineregionexit",
        "statuschanged",
        "error",
        "warning",
        "exception",
      ];
      for (const eventName of trackedEvents) {
        player.addEventListener(eventName, (event) => {
          const detail =
            event && typeof event === "object" && "detail" in event
              ? (event as { detail?: unknown }).detail
              : null;
          const payload = describeShakaErrorPayload(event);

          console.log(
            `[SoundCloud DRM] shaka event: ${eventName}`,
            JSON.stringify({
              songId: currentSong.id,
              hasDetail: detail != null,
              detailPreview:
                detail == null
                  ? null
                  : (() => {
                      try {
                        return JSON.stringify(detail).slice(0, 400);
                      } catch {
                        return String(detail).slice(0, 200);
                      }
                    })(),
              code: payload.code,
              category: payload.category,
              severity: payload.severity,
              meaning:
                eventName === "error" || eventName === "warning"
                  ? shakaErrorMeaning(payload.category, payload.code)
                  : null,
            })
          );

          if (eventName === "error" || eventName === "warning") {
            reportDebugEvent(
              playbackRunIdRef.current,
              "H1",
              `app/contexts/AudioContext.tsx:shaka-event:${eventName}`,
              `[DEBUG] Shaka event ${eventName}`,
              {
                songId: currentSong.id,
                source: currentSong.source || null,
                event: eventName,
                code: payload.code,
                category: payload.category,
                severity: payload.severity,
                data: payload.data,
                message: payload.message,
                innerError: payload.innerError,
                meaning: shakaErrorMeaning(payload.category, payload.code),
              }
            );
          }
        });
      }

      const drmServers: Record<string, string> = {
        [currentSong.drmScheme]: proxiedLicenseUrl,
      };

      try {
        player.configure({
          drm: {
            servers: drmServers,
            advanced: {
              "com.widevine.alpha": {
                videoRobustness: "SW_SECURE_CRYPTO",
                audioRobustness: "SW_SECURE_CRYPTO",
              },
            },
            retryParameters: {
              maxAttempts: 4,
              baseDelay: 500,
              backoffFactor: 2,
            },
          },
          streaming: {
            bufferingGoal: 30,
            rebufferingGoal: 4,
            retryParameters: {
              maxAttempts: 5,
              baseDelay: 500,
              backoffFactor: 2,
            },
          },
          manifest: {
            retryParameters: {
              maxAttempts: 5,
              baseDelay: 500,
              backoffFactor: 2,
            },
          },
          abr: {
            enabled: false,
          },
        });
      } catch (configError) {
        console.error("[SoundCloud DRM] player.configure threw", configError);
        throw configError;
      }

      console.log(
        "[SoundCloud DRM] Attaching Shaka to audio element",
        JSON.stringify({
          paused: audio.paused,
          networkState: audio.networkState,
          readyState: audio.readyState,
          src: audio.currentSrc || audio.src || null,
          crossOrigin: audio.crossOrigin,
          isSecureContext:
            typeof window !== "undefined" ? window.isSecureContext : null,
        })
      );

      reportDebugEvent(
        playbackRunIdRef.current,
        "H4",
        "app/contexts/AudioContext.tsx:playback-effect:soundcloud-drm-attach-start",
        "[DEBUG] SoundCloud DRM attach starting",
        {
          songId: currentSong.id,
          source: currentSong.source || null,
          audioNetworkState: audio.networkState,
          audioReadyState: audio.readyState,
          audioPaused: audio.paused,
          audioCrossOrigin: audio.crossOrigin,
          manifestUrl: soundCloudManifestUrl,
          isSecureContext:
            typeof window !== "undefined" ? window.isSecureContext : null,
        }
      );

      try {
        await player.attach(audio);
      } catch (attachError) {
        console.error("[SoundCloud DRM] player.attach threw", attachError);
        throw attachError;
      }

      console.log(
        "[SoundCloud DRM] Shaka attached, now loading manifest",
        soundCloudManifestUrl
      );

      try {
        await player.load(soundCloudManifestUrl);
      } catch (loadError) {
        const payload = describeShakaErrorPayload(loadError);
        console.error(
          "[SoundCloud DRM] player.load rejected",
          JSON.stringify({
            message: payload.message,
            code: payload.code,
            category: payload.category,
            severity: payload.severity,
            data: payload.data,
            innerError: payload.innerError,
            meaning: shakaErrorMeaning(payload.category, payload.code),
            rawString: (() => {
              try {
                return JSON.stringify(loadError);
              } catch {
                return String(loadError);
              }
            })(),
          })
        );
        throw loadError;
      }

      console.log(
        "[SoundCloud DRM] Shaka load completed",
        JSON.stringify({
          songId: currentSong.id,
          isLive: typeof player.isLive === "function" ? player.isLive() : null,
          audioDuration: audio.duration || null,
          audioReadyState: audio.readyState,
        })
      );

      setPlaybackError(null);
      setDuration(audio.duration || currentSong.duration || 0);
      setIsSongLoading(false);
      if (!cancelled && isPlaying) {
        attemptAudioPlay(audio, currentSong, requestId);
      }
    };

    if (nextAudioType === "soundcloud-drm") {
      const inFlight = shakaInitInFlightRef.current;
      if (
        inFlight &&
        inFlight.songId === currentSong.id &&
        inFlight.audioUrl === nextAudioUrl
      ) {
        // #region debug-point H4:soundcloud-drm-skip-reentry
        reportDebugEvent(
          playbackRunIdRef.current,
          "H4",
          "app/contexts/AudioContext.tsx:playback-effect:soundcloud-drm-skip-reentry",
          "[DEBUG] SoundCloud DRM effect re-entry skipped while initialization in flight",
          {
            songId: currentSong.id,
            source: currentSong.source || null,
            isPlaying,
          }
        );
        // #endregion
        return;
      }

      if (shakaSourceRef.current !== nextAudioUrl) {
        // #region debug-point H4:soundcloud-drm-reset-audio
        reportDebugEvent(
          playbackRunIdRef.current,
          "H4",
          "app/contexts/AudioContext.tsx:playback-effect:soundcloud-drm-reset-audio",
          "[DEBUG] SoundCloud DRM preparing audio element for Shaka attach",
          {
            songId: currentSong.id,
            source: currentSong.source || null,
            nextAudioUrl,
            previousSrc: audio.currentSrc || audio.src || null,
            audioPaused: audio.paused,
            audioNetworkState: audio.networkState,
            audioReadyState: audio.readyState,
          }
        );
        // #endregion
        pauseManagedAudio(true);
        try {
          audio.removeAttribute("src");
        } catch {}
        setCurrentTime(0);
        setDuration(currentSong.duration || 0);
        setIsSongLoading(true);
        shakaInitInFlightRef.current = {
          songId: currentSong.id,
          audioUrl: nextAudioUrl,
        };
        void configureSoundCloudDrmPlayback()
          .catch((error) => {
            if (!isPlaybackRequestCurrent(requestId)) {
              return;
            }
            const errorMessage = describePlaybackError(error);
            const errorPayload = describeShakaErrorPayload(error);
            // #region debug-point H1:soundcloud-drm-catch
            reportDebugEvent(
              playbackRunIdRef.current,
              "H1",
              "app/contexts/AudioContext.tsx:playback-effect:soundcloud-drm-catch",
              "[DEBUG] SoundCloud DRM setup promise rejected",
              {
                songId: currentSong.id,
                source: currentSong.source || null,
                audioUrl: nextAudioUrl,
                errorMessage,
                errorDetails: errorPayload,
                meaning: shakaErrorMeaning(
                  errorPayload.category,
                  errorPayload.code
                ),
                audioCurrentSrc: audio.currentSrc || audio.src || null,
                audioPaused: audio.paused,
                audioNetworkState: audio.networkState,
                audioReadyState: audio.readyState,
                isSecureContext:
                  typeof window !== "undefined" ? window.isSecureContext : null,
                audioCrossOrigin: audio.crossOrigin,
              }
            );
            // #endregion
            console.error(
              "[SoundCloud DRM] setup failed",
              JSON.stringify({
                message: errorMessage,
                payload: errorPayload,
                meaning: shakaErrorMeaning(
                  errorPayload.category,
                  errorPayload.code
                ),
                audio: {
                  src: audio.currentSrc || audio.src || null,
                  paused: audio.paused,
                  networkState: audio.networkState,
                  readyState: audio.readyState,
                  crossOrigin: audio.crossOrigin,
                  error: audio.error
                    ? {
                        code: audio.error.code,
                        message: audio.error.message,
                      }
                    : null,
                },
                raw: (() => {
                  try {
                    return JSON.stringify(error);
                  } catch {
                    return String(error);
                  }
                })(),
              })
            );
            setPlaybackError(errorMessage || DEFAULT_PLAYBACK_ERROR);
            setIsSongLoading(false);
            setIsPlaying(false);
            destroyShakaPlayback();
          })
          .finally(() => {
            if (
              shakaInitInFlightRef.current &&
              shakaInitInFlightRef.current.songId === currentSong.id &&
              shakaInitInFlightRef.current.audioUrl === nextAudioUrl
            ) {
              shakaInitInFlightRef.current = null;
            }
            if (shakaPlayerRef.current === null) {
              shakaSourceRef.current = null;
            }
          });
      } else if (isPlaying) {
        attemptAudioPlay(audio, currentSong, requestId);
      } else {
        pauseManagedAudio(true);
      }
    } else if (nextAudioType === "hls") {
      if (hlsSourceRef.current !== nextAudioUrl) {
        pauseManagedAudio(true);
        audio.currentTime = 0;
        audio.removeAttribute("src");
        audio.load();
        setCurrentTime(0);
        setDuration(currentSong.duration || 0);
        setIsSongLoading(true);
        void configureHlsPlayback().catch((error) => {
          if (!isPlaybackRequestCurrent(requestId)) {
            return;
          }
          console.error("Error initializing HLS playback:", error);
          setPlaybackError(
            error instanceof Error ? error.message : DEFAULT_PLAYBACK_ERROR
          );
          setIsSongLoading(false);
          setIsPlaying(false);
        });
      } else if (isPlaying) {
        attemptAudioPlay(audio, currentSong, requestId);
      } else {
        pauseManagedAudio(true);
      }
    } else {
      if (hlsControllerRef.current || shakaPlayerRef.current) {
        destroyManagedPlayback();
      }

      if (audio.src !== nextAudioUrl) {
        // #region debug-point H4:audio-src-updated
        reportDebugEvent(
          playbackRunIdRef.current,
          "H4",
          "app/contexts/AudioContext.tsx:playback-effect:set-src",
          "[DEBUG] playback audio src updated",
          {
            songId: currentSong.id,
            source: currentSong.source || null,
            audioUrl: nextAudioUrl,
          }
        );
        // #endregion
        pauseManagedAudio(true);
        audio.currentTime = 0;
        audio.src = nextAudioUrl;
        audio.load();
        setCurrentTime(0);
        setDuration(currentSong.duration || 0);
      }

      if (isPlaying) {
        attemptAudioPlay(audio, currentSong, requestId);
      } else {
        pauseManagedAudio(true);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [
    currentSong,
    isPlaying,
    isSongLoading,
    pauseManagedAudio,
    syncSoundCloudWidgetProgress,
  ]);

  useEffect(() => {
    if (soundCloudWidgetProgressIntervalRef.current !== null) {
      window.clearInterval(soundCloudWidgetProgressIntervalRef.current);
      soundCloudWidgetProgressIntervalRef.current = null;
    }

    if (!shouldUseSoundCloudWidget(currentSong) || !isPlaying) {
      return;
    }

    soundCloudWidgetProgressIntervalRef.current = window.setInterval(() => {
      syncSoundCloudWidgetProgress(currentSong?.duration);
    }, 500);

    return () => {
      if (soundCloudWidgetProgressIntervalRef.current !== null) {
        window.clearInterval(soundCloudWidgetProgressIntervalRef.current);
        soundCloudWidgetProgressIntervalRef.current = null;
      }
    };
  }, [currentSong, isPlaying, syncSoundCloudWidgetProgress]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
    }

    if (!shouldUseSoundCloudWidget(currentSong)) return;

    try {
      soundCloudWidgetRef.current?.setVolume(Math.round(volume * 100));
    } catch (error) {
      console.error("Error setting SoundCloud widget volume:", error);
    }
  }, [currentSong, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;
    if (shouldUseSoundCloudWidget(currentSong)) return;

    const syncPlaybackState = () => {
      syncPlaybackStateFromElement(audio, currentSong.duration || 0);
    };

    syncPlaybackState();

    audio.addEventListener("timeupdate", syncPlaybackState);
    audio.addEventListener("loadedmetadata", syncPlaybackState);
    audio.addEventListener("durationchange", syncPlaybackState);
    audio.addEventListener("seeking", syncPlaybackState);
    audio.addEventListener("seeked", syncPlaybackState);

    return () => {
      audio.removeEventListener("timeupdate", syncPlaybackState);
      audio.removeEventListener("loadedmetadata", syncPlaybackState);
      audio.removeEventListener("durationchange", syncPlaybackState);
      audio.removeEventListener("seeking", syncPlaybackState);
      audio.removeEventListener("seeked", syncPlaybackState);
    };
  }, [currentSong?.duration, currentSong?.id, syncPlaybackStateFromElement]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (shouldUseSoundCloudWidget(currentSong)) return;

    const handlePlay = () => {
      setPlaybackError(null);
      // #region debug-point H5:audio-event-play
      reportDebugEvent(
        playbackRunIdRef.current,
        "H5",
        "app/contexts/AudioContext.tsx:audio-event:play",
        "[DEBUG] audio element emitted play",
        {
          songId: currentSong?.id || null,
          currentSrc: audio.currentSrc || audio.src || null,
        }
      );
      // #endregion
      setIsPlaying(true);
      setIsSongLoading(false);
    };

    const handlePause = () => {
      if (suppressNextPauseEventRef.current) {
        suppressNextPauseEventRef.current = false;
        return;
      }
      if (isSongLoading && !audio.ended) {
        return;
      }
      setIsPlaying(false);
    };

    const handleWaiting = () => {
      // #region debug-point H5:audio-event-waiting
      reportDebugEvent(
        playbackRunIdRef.current,
        "H5",
        "app/contexts/AudioContext.tsx:audio-event:waiting",
        "[DEBUG] audio element waiting",
        {
          songId: currentSong?.id || null,
          currentSrc: audio.currentSrc || audio.src || null,
          networkState: audio.networkState,
          readyState: audio.readyState,
        }
      );
      // #endregion
      if (!audio.paused) {
        setIsSongLoading(true);
      }
    };

    const handlePlaying = () => {
      setPlaybackError(null);
      // #region debug-point H5:audio-event-playing
      reportDebugEvent(
        playbackRunIdRef.current,
        "H5",
        "app/contexts/AudioContext.tsx:audio-event:playing",
        "[DEBUG] audio element playing",
        {
          songId: currentSong?.id || null,
          currentSrc: audio.currentSrc || audio.src || null,
        }
      );
      // #endregion
      setIsPlaying(true);
      setIsSongLoading(false);
    };

    const handleCanPlay = () => {
      setPlaybackError(null);
      // #region debug-point H5:audio-event-canplay
      reportDebugEvent(
        playbackRunIdRef.current,
        "H5",
        "app/contexts/AudioContext.tsx:audio-event:canplay",
        "[DEBUG] audio element canplay",
        {
          songId: currentSong?.id || null,
          currentSrc: audio.currentSrc || audio.src || null,
          readyState: audio.readyState,
        }
      );
      // #endregion
      setIsSongLoading(false);
    };

    const handleEmptied = () => {
      // #region debug-point H5:audio-event-emptied
      reportDebugEvent(
        playbackRunIdRef.current,
        "H5",
        "app/contexts/AudioContext.tsx:audio-event:emptied",
        "[DEBUG] audio element emptied",
        {
          songId: currentSong?.id || null,
          currentSrc: audio.currentSrc || audio.src || null,
        }
      );
      // #endregion
      if (isSongLoading && !currentSong?.audioUrl) {
        return;
      }
      setIsSongLoading(false);
    };

    const handleError = () => {
      const mediaError = audio.error;
      if (
        tryNextAudioCandidate(
          currentSong,
          "audio-element-error",
          audio.currentSrc || audio.src || currentSong?.audioUrl
        )
      ) {
        return;
      }
      // #region debug-point H1:audio-element-error
      reportDebugEvent(
        playbackRunIdRef.current,
        "H1",
        "app/contexts/AudioContext.tsx:audio-event:error",
        "[DEBUG] audio element error",
        {
          songId: currentSong?.id || null,
          currentSrc: audio.currentSrc || audio.src || null,
          networkState: audio.networkState,
          readyState: audio.readyState,
          mediaErrorCode: mediaError?.code ?? null,
          mediaErrorMessage: mediaError?.message ?? null,
        }
      );
      // #endregion
      setPlaybackError(DEFAULT_PLAYBACK_ERROR);
      setIsSongLoading(false);
      setIsPlaying(false);
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("canplaythrough", handleCanPlay);
    audio.addEventListener("emptied", handleEmptied);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("canplaythrough", handleCanPlay);
      audio.removeEventListener("emptied", handleEmptied);
      audio.removeEventListener("error", handleError);
    };
  }, [currentSong?.id, currentSong?.audioUrl, isSongLoading]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPlaying || shouldUseSoundCloudWidget(currentSong)) {
      return;
    }

    const syncPlaybackProgress = () => {
      syncPlaybackStateFromElement(audio, currentSong?.duration || 0);
    };

    syncPlaybackProgress();
    const timer = window.setInterval(
      syncPlaybackProgress,
      PLAYBACK_PROGRESS_UPDATE_MS
    );

    return () => {
      window.clearInterval(timer);
    };
  }, [
    currentSong,
    currentSong?.duration,
    isPlaying,
    syncPlaybackStateFromElement,
  ]);

  const applyPlaybackOptions = (
    song: Song,
    options?: PlaybackOptions
  ): void => {
    if (options?.queue && options.queue.length > 0) {
      const normalizedQueue = options.queue.map((entry) =>
        normalizeSong(entry)
      );
      let nextIndex =
        typeof options.currentIndex === "number" ? options.currentIndex : -1;

      if (nextIndex < 0) {
        nextIndex = normalizedQueue.findIndex((entry) => entry.id === song.id);
      }

      if (nextIndex < 0 || nextIndex >= normalizedQueue.length) {
        nextIndex = 0;
      }

      normalizedQueue[nextIndex] = {
        ...normalizedQueue[nextIndex],
        ...song,
      };

      setPlaybackQueue(normalizedQueue);
      setQueueIndex(nextIndex);
      return;
    }

    setPlaybackQueue([song]);
    setQueueIndex(0);
  };

  const resolveSongForPlayback = async (song: Song): Promise<Song> => {
    if (song.audioUrl && !shouldRefreshResolvedAudio(song)) {
      // #region debug-point H4:resolve-skip-refresh
      reportDebugEvent(
        playbackRunIdRef.current,
        "H4",
        "app/contexts/AudioContext.tsx:resolveSongForPlayback:skip-refresh",
        "[DEBUG] playback resolution skipped refresh",
        {
          songId: song.id,
          source: song.source || null,
          audioUrl: song.audioUrl,
        }
      );
      // #endregion
      return normalizeSong(song);
    }

    const params = new URLSearchParams();
    params.set("id", song.id);
    params.set("title", song.title);
    params.set("artist", song.artist);
    if (song.source) params.set("source", song.source);
    if (song.url) params.set("url", song.url);

    // #region debug-point H4:resolve-start
    reportDebugEvent(
      playbackRunIdRef.current,
      "H4",
      "app/contexts/AudioContext.tsx:resolveSongForPlayback:start",
      "[DEBUG] playback resolution started",
      {
        songId: song.id,
        title: song.title,
        source: song.source || null,
        hasInputAudioUrl: Boolean(song.audioUrl),
      }
    );
    // #endregion
    const response = await fetch(`/api/video?${params.toString()}`);
    const payload = (await response.json()) as Record<string, unknown>;

    // #region debug-point H4:resolve-response
    reportDebugEvent(
      playbackRunIdRef.current,
      "H4",
      "app/contexts/AudioContext.tsx:resolveSongForPlayback:response",
      "[DEBUG] playback resolution completed",
      {
        songId: song.id,
        ok: response.ok,
        status: response.status,
        source: song.source || null,
        hasAudioUrl: typeof payload.audioUrl === "string",
        audioUrlCount: Array.isArray(payload.audioUrls)
          ? payload.audioUrls.length
          : 0,
        resolvedAudioUrl:
          typeof payload.audioUrl === "string" ? payload.audioUrl : null,
      }
    );
    // #endregion

    const payloadAudioUrls = Array.isArray(payload.audioUrls)
      ? payload.audioUrls.filter(
          (value): value is string =>
            typeof value === "string" && Boolean(value.trim())
        )
      : [];
    const resolvedAudioType =
      payload.audioType === "hls" ||
      payload.audioType === "file" ||
      payload.audioType === "soundcloud-drm"
        ? payload.audioType
        : undefined;
    const resolvedAudioUrl =
      typeof payload.audioUrl === "string" && payload.audioUrl.trim()
        ? payload.audioUrl
        : payloadAudioUrls[0];
    const responseError =
      typeof payload.error === "string" && payload.error.trim()
        ? payload.error.trim()
        : "Couldn't load this track right now.";

    if (!response.ok || !resolvedAudioUrl) {
      throw new Error(responseError);
    }

    const resolvedId =
      typeof payload.id === "string" && payload.id.trim()
        ? payload.id
        : song.id;
    const resolvedTitle =
      typeof payload.title === "string" && payload.title.trim()
        ? payload.title
        : song.title;
    const resolvedArtist =
      typeof payload.author === "string" && payload.author.trim()
        ? payload.author
        : song.artist;
    const resolvedCoverUrl =
      typeof payload.thumbnailUrl === "string" && payload.thumbnailUrl.trim()
        ? payload.thumbnailUrl
        : song.coverUrl;
    const resolvedUrl =
      typeof payload.url === "string" && payload.url.trim()
        ? payload.url
        : song.url;
    const resolvedSource =
      typeof payload.source === "string" && payload.source.trim()
        ? payload.source
        : song.source;

    return normalizeSong({
      ...song,
      id: resolvedId,
      title: resolvedTitle,
      artist: resolvedArtist,
      coverUrl: resolvedCoverUrl,
      source: resolvedSource,
      url: resolvedUrl,
      audioUrl: resolvedAudioUrl,
      audioType: inferAudioType(resolvedAudioUrl, resolvedAudioType),
      playbackStrategy:
        payload.playbackStrategy === "widget" ? "widget" : undefined,
      drmLicenseUrl:
        typeof payload.drmLicenseUrl === "string"
          ? payload.drmLicenseUrl
          : undefined,
      drmScheme:
        typeof payload.drmScheme === "string" ? payload.drmScheme : undefined,
      drmProvider:
        typeof payload.drmProvider === "string"
          ? payload.drmProvider
          : undefined,
      drmHeaders:
        payload.drmHeaders &&
        typeof payload.drmHeaders === "object" &&
        !Array.isArray(payload.drmHeaders)
          ? Object.fromEntries(
              Object.entries(payload.drmHeaders).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string"
              )
            )
          : undefined,
      audioUrls: normalizeAudioCandidates({
        ...song,
        audioUrl: resolvedAudioUrl,
        audioUrls: payloadAudioUrls,
      }),
      duration:
        typeof payload.lengthSeconds === "number"
          ? payload.lengthSeconds
          : song.duration,
      relatedSongs: normalizeRelatedSongsPayload(
        payload.relatedSongs,
        resolvedSource
      ),
    });
  };

  resolveSongForPlaybackRef.current = resolveSongForPlayback;

  const playRecommendedSong = useCallback(
    async (seedSong: Song): Promise<boolean> => {
      if (!settings.autoplayRecommendations) return false;

      const seen = new Set<string>([seedSong.id]);
      const candidatePool = [
        ...(seedSong.relatedSongs || []),
        ...recentSongsRef.current,
      ];

      let nextSong: Song | null = null;
      for (const candidate of candidatePool) {
        if (!candidate?.id || seen.has(candidate.id)) continue;
        seen.add(candidate.id);
        nextSong = normalizeSong(candidate);
        break;
      }

      if (!nextSong) return false;

      const baseQueue = playbackQueueRef.current.map((entry) =>
        normalizeSong(entry)
      );
      const dedupedQueue = baseQueue.filter(
        (entry) => entry.id !== nextSong.id
      );
      const nextQueue = [...dedupedQueue, nextSong];
      const nextIndex = nextQueue.length - 1;

      setIsPlaying(false);
      setCurrentTime(0);
      setIsSongLoading(true);

      try {
        const resolvedSong = await resolveSongForPlaybackRef.current(nextSong);
        if (
          currentSongRef.current &&
          currentSongRef.current.id !== seedSong.id &&
          currentSongRef.current.id !== resolvedSong.id
        ) {
          return false;
        }

        setPlaybackQueue(
          nextQueue.map((entry, index) =>
            index === nextIndex ? { ...entry, ...resolvedSong } : entry
          )
        );
        setQueueIndex(nextIndex);
        setCurrentSong(resolvedSong);
        setDuration(resolvedSong.duration || 0);
        setPlaybackError(null);
        setIsSongLoading(false);
        setIsPlaying(true);
        return true;
      } catch (error) {
        console.error("Error autoplaying recommended audio:", error);
        setPlaybackError(
          error instanceof Error ? error.message : DEFAULT_PLAYBACK_ERROR
        );
        setIsSongLoading(false);
        setIsPlaying(false);
        setCurrentTime(0);
        return false;
      }
    },
    [settings.autoplayRecommendations]
  );
  playRecommendedSongRef.current = playRecommendedSong;

  // Handle audio ended
  useEffect(() => {
    if (!currentSong && isFullscreenOpen) {
      setIsFullscreenOpen(false);
    }
  }, [currentSong, isFullscreenOpen]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (shouldUseSoundCloudWidget(currentSong)) return;

    const handleEnded = () => {
      if (isRepeat) {
        audio.currentTime = 0;
        audio.play().catch((error) => {
          console.error("Error repeating audio:", error);
        });
      } else if (
        playbackQueue.length > 0 &&
        queueIndex >= 0 &&
        queueIndex < playbackQueue.length - 1
      ) {
        const nextSong = playbackQueue[queueIndex + 1];
        if (!nextSong) return;

        setIsPlaying(false);
        setCurrentTime(0);
        setIsSongLoading(true);

        void resolveSongForPlayback(nextSong)
          .then((resolvedSong) => {
            const nextQueue = playbackQueue.map((entry) =>
              normalizeSong(entry)
            );
            nextQueue[queueIndex + 1] = {
              ...nextQueue[queueIndex + 1],
              ...resolvedSong,
            };
            setPlaybackQueue(nextQueue);
            setQueueIndex(queueIndex + 1);
            setCurrentSong(resolvedSong);
            setDuration(resolvedSong.duration || 0);
            setPlaybackError(null);
            setIsSongLoading(false);
            setIsPlaying(true);
          })
          .catch((error) => {
            console.error("Error playing next queued audio:", error);
            setPlaybackError(
              error instanceof Error ? error.message : DEFAULT_PLAYBACK_ERROR
            );
            setIsSongLoading(false);
            setIsPlaying(false);
            setCurrentTime(0);
          });
      } else {
        void playRecommendedSongRef
          .current(currentSong)
          .then((didPlayRecommendation) => {
            if (!didPlayRecommendation) {
              setIsPlaying(false);
              setCurrentTime(0);
            }
          });
      }
    };

    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
  }, [currentSong, isRepeat, playbackQueue, queueIndex]);

  const playSong = (
    song: Song,
    options?: PlaybackOptions,
    requestId?: number
  ) => {
    const audio = audioRef.current;
    const normalizedSong = normalizeSong(song);
    const activeRequestId =
      typeof requestId === "number" ? requestId : createPlaybackRequest();

    if (!isPlaybackRequestCurrent(activeRequestId)) {
      return;
    }

    destroyManagedPlayback();
    destroySoundCloudWidgetPlayback();

    if (audio) {
      pauseManagedAudio(true);
      audio.currentTime = 0;
    }

    setCurrentSong(normalizedSong);
    if (!autoRetryInFlightRef.current) {
      autoRetryAttemptCountRef.current[normalizedSong.id] = 0;
      clearAutoRetryState();
      setTransientAutoRetryStatus(null);
      setShowAutoRetryPrompt(false);
    }
    applyPlaybackOptions(normalizedSong, options);
    setRecentSongs((prev) => {
      const existing = prev.find((entry) => entry.id === normalizedSong.id);
      const merged = existing
        ? { ...existing, ...normalizedSong }
        : normalizedSong;
      return [
        merged,
        ...prev.filter((entry) => entry.id !== normalizedSong.id),
      ];
    });
    setCurrentTime(0);
    setDuration(normalizedSong.duration || 0);
    setPlaybackError(null);
    setIsSongLoading(false);
    setIsPlaying(true);
    playbackRunIdRef.current = `request-${activeRequestId}`;
    if (settings.openFullscreenOnPlay) {
      setIsFullscreenOpen(true);
    }
  };

  const beginSongLoad = (
    song: Song,
    options?: PlaybackOptions,
    requestId?: number
  ) => {
    const audio = audioRef.current;
    const normalizedSong = normalizeSong(song);
    const activeRequestId =
      typeof requestId === "number" ? requestId : createPlaybackRequest();

    if (!isPlaybackRequestCurrent(activeRequestId)) {
      return;
    }

    destroyManagedPlayback();
    destroySoundCloudWidgetPlayback();

    if (audio) {
      pauseManagedAudio(true);
      audio.currentTime = 0;
      audio.removeAttribute("src");
      audio.load();
    }

    setCurrentSong(normalizedSong);
    if (!autoRetryInFlightRef.current) {
      autoRetryAttemptCountRef.current[normalizedSong.id] = 0;
      clearAutoRetryState();
      setTransientAutoRetryStatus(null);
      setShowAutoRetryPrompt(false);
    }
    applyPlaybackOptions(normalizedSong, options);
    setRecentSongs((prev) => {
      const existing = prev.find((entry) => entry.id === normalizedSong.id);
      const merged = existing
        ? { ...existing, ...normalizedSong }
        : normalizedSong;
      return [
        merged,
        ...prev.filter((entry) => entry.id !== normalizedSong.id),
      ];
    });
    setCurrentTime(0);
    setDuration(normalizedSong.duration || 0);
    setPlaybackError(null);
    setIsPlaying(false);
    setIsSongLoading(true);
    if (settings.openFullscreenOnPlay) {
      setIsFullscreenOpen(true);
    }
    playbackRunIdRef.current = `request-${activeRequestId}`;
    // #region debug-point H5:begin-song-load
    reportDebugEvent(
      playbackRunIdRef.current,
      "H5",
      "app/contexts/AudioContext.tsx:beginSongLoad",
      "[DEBUG] song loading started",
      {
        songId: normalizedSong.id,
        title: normalizedSong.title,
        source: normalizedSong.source || null,
        hasAudioUrl: Boolean(normalizedSong.audioUrl),
        queueLength: options?.queue?.length ?? playbackQueue.length,
      }
    );
    // #endregion
  };

  const resolveAndPlaySong = async (song: Song, options?: PlaybackOptions) => {
    const requestId = createPlaybackRequest();
    beginSongLoad(song, options, requestId);

    try {
      const resolvedSong = await resolveSongForPlayback(song);
      if (!isPlaybackRequestCurrent(requestId)) {
        return;
      }
      // #region debug-point H5:resolve-and-play-success
      reportDebugEvent(
        playbackRunIdRef.current,
        "H5",
        "app/contexts/AudioContext.tsx:resolveAndPlaySong:success",
        "[DEBUG] resolveAndPlaySong succeeded",
        {
          songId: resolvedSong.id,
          source: resolvedSong.source || null,
          hasAudioUrl: Boolean(resolvedSong.audioUrl),
        }
      );
      // #endregion
      playSong(resolvedSong, options, requestId);
    } catch (error) {
      if (!isPlaybackRequestCurrent(requestId)) {
        return;
      }
      // #region debug-point H1:resolve-and-play-failure
      reportDebugEvent(
        playbackRunIdRef.current,
        "H1",
        "app/contexts/AudioContext.tsx:resolveAndPlaySong:failure",
        "[DEBUG] resolveAndPlaySong failed",
        {
          songId: song.id,
          source: song.source || null,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      // #endregion
      setPlaybackError(
        error instanceof Error ? error.message : DEFAULT_PLAYBACK_ERROR
      );
      clearSongLoading();
      throw error;
    }
  };

  const clearSongLoading = () => {
    setIsSongLoading(false);
  };

  const pauseSong = () => {
    setIsPlaying(false);
    if (shouldUseSoundCloudWidget(currentSong)) {
      try {
        soundCloudWidgetRef.current?.pause();
      } catch (error) {
        console.error("Error pausing SoundCloud widget:", error);
      }
      return;
    }
    if (audioRef.current) {
      pauseManagedAudio(false);
    }
  };

  const resumeSong = () => {
    if (!currentSong) return;
    if (shouldUseSoundCloudWidget(currentSong)) {
      setIsPlaying(true);
      try {
        soundCloudWidgetRef.current?.play();
      } catch (error) {
        console.error("Error resuming SoundCloud widget:", error);
        setIsPlaying(false);
      }
      return;
    }
    if (audioRef.current) {
      setIsPlaying(true);
      audioRef.current.play().catch((error) => {
        console.error("Error resuming audio:", error);
        setIsPlaying(false);
      });
    }
  };

  const seekTo = (time: number) => {
    if (shouldUseSoundCloudWidget(currentSong)) {
      try {
        soundCloudWidgetRef.current?.seekTo(Math.max(0, time * 1000));
        setCurrentTime(time);
      } catch (error) {
        console.error("Error seeking SoundCloud widget:", error);
      }
      return;
    }
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const setVolume = (newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolumeState(clampedVolume);
    if (shouldUseSoundCloudWidget(currentSong)) {
      try {
        soundCloudWidgetRef.current?.setVolume(Math.round(clampedVolume * 100));
      } catch (error) {
        console.error("Error setting SoundCloud widget volume:", error);
      }
      return;
    }
    if (audioRef.current) {
      audioRef.current.volume = clampedVolume;
    }
  };

  const toggleRepeat = () => {
    setIsRepeat((prev) => !prev);
  };

  const playQueueIndex = (index: number) => {
    if (index < 0 || index >= playbackQueue.length) return;

    const song = playbackQueue[index];
    if (!song) return;

    const options = { queue: playbackQueue, currentIndex: index };

    if (song.audioUrl) {
      playSong(song, options);
      return;
    }

    void resolveAndPlaySong(song, options).catch((error) => {
      console.error("Failed to play queued song:", error);
    });
  };

  const playNext = () => {
    if (queueIndex >= 0 && queueIndex < playbackQueue.length - 1) {
      playQueueIndex(queueIndex + 1);
    }
  };

  const playPrevious = () => {
    if (currentTime > 3) {
      seekTo(0);
      return;
    }

    if (queueIndex > 0) {
      playQueueIndex(queueIndex - 1);
      return;
    }

    if (recentSongs.length > 1) {
      playSong(recentSongs[1]);
    }
  };

  const openFullscreen = () => {
    if (currentSong) {
      setIsFullscreenOpen(true);
    }
  };

  const closeFullscreen = () => {
    setIsFullscreenOpen(false);
  };

  useEffect(() => {
    if (!settings.keyboardShortcuts) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName || "";
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (event.code === "Space" && currentSong) {
        event.preventDefault();
        if (isPlaying) {
          pauseSong();
        } else {
          resumeSong();
        }
        return;
      }

      if (!currentSong) return;

      if (event.code === "ArrowLeft") {
        event.preventDefault();
        seekTo(Math.max(0, currentTime - settings.seekStepSeconds));
        return;
      }

      if (event.code === "ArrowRight") {
        event.preventDefault();
        seekTo(
          Math.min(
            duration ||
              currentSong.duration ||
              currentTime + settings.seekStepSeconds,
            currentTime + settings.seekStepSeconds
          )
        );
        return;
      }

      if (event.code === "ArrowUp") {
        event.preventDefault();
        setVolume(Math.min(1, volume + 0.05));
        return;
      }

      if (event.code === "ArrowDown") {
        event.preventDefault();
        setVolume(Math.max(0, volume - 0.05));
        return;
      }

      if (event.code === "KeyF") {
        event.preventDefault();
        if (isFullscreenOpen) {
          closeFullscreen();
        } else {
          openFullscreen();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    closeFullscreen,
    currentSong,
    currentTime,
    duration,
    isFullscreenOpen,
    isPlaying,
    openFullscreen,
    pauseSong,
    resumeSong,
    seekTo,
    setVolume,
    settings.keyboardShortcuts,
    settings.seekStepSeconds,
    volume,
  ]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong || shouldUseSoundCloudWidget(currentSong))
      return;

    const syncActualPlaybackState = () => {
      const isActuallyPlaying =
        !audio.paused && !audio.ended && audio.currentSrc.length > 0;

      if (!isSongLoading && isPlaying !== isActuallyPlaying) {
        setIsPlaying(isActuallyPlaying);
      }
    };

    syncActualPlaybackState();
    const timer = window.setInterval(syncActualPlaybackState, 900);
    return () => {
      window.clearInterval(timer);
    };
  }, [currentSong, isPlaying, isSongLoading]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    const mediaSession = navigator.mediaSession;

    if (!currentSong) {
      mediaSession.metadata = null;
      mediaSession.playbackState = "none";
      return;
    }

    mediaSession.metadata = new MediaMetadata({
      title: currentSong.title || "Unknown Track",
      artist: currentSong.artist || "Unknown Artist",
      album:
        playbackQueue.length > 1 && queueIndex >= 0
          ? settings.language === "fa"
            ? `صف ${formatNumberByLanguage(
                settings.language,
                queueIndex + 1
              )} از ${formatNumberByLanguage(
                settings.language,
                playbackQueue.length
              )}`
            : `Queue ${formatNumberByLanguage(
                settings.language,
                queueIndex + 1
              )} of ${formatNumberByLanguage(
                settings.language,
                playbackQueue.length
              )}`
          : currentSong.source || "Streamify",
      artwork: buildSongArtwork(currentSong),
    });

    // #region debug-point H1:media-session-update
    reportDebugEvent(
      playbackRunIdRef.current,
      "H1",
      "app/contexts/AudioContext.tsx:media-session-update",
      "[DEBUG] media session updated",
      {
        songId: currentSong.id,
        source: currentSong.source || null,
        isPlaying,
        duration: duration || currentSong.duration || 0,
        hasArtwork: buildSongArtwork(currentSong).length > 0,
        hasFocus:
          typeof document !== "undefined" &&
          typeof document.hasFocus === "function"
            ? document.hasFocus()
            : null,
        hidden: typeof document !== "undefined" ? document.hidden : null,
        visibilityState:
          typeof document !== "undefined" ? document.visibilityState : null,
      }
    );
    // #endregion

    mediaSession.playbackState = isPlaying ? "playing" : "paused";

    const setHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null
    ) => {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {}
    };

    setHandler("play", () => resumeSong());
    setHandler("pause", () => pauseSong());
    setHandler("previoustrack", () => playPrevious());
    setHandler("nexttrack", () => playNext());
    setHandler("seekbackward", (details) =>
      seekTo(
        Math.max(
          0,
          currentTime - (details.seekOffset || settings.seekStepSeconds)
        )
      )
    );
    setHandler("seekforward", (details) =>
      seekTo(
        Math.min(
          duration ||
            currentSong.duration ||
            currentTime + settings.seekStepSeconds,
          currentTime + (details.seekOffset || settings.seekStepSeconds)
        )
      )
    );
    setHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") {
        seekTo(details.seekTime);
      }
    });
    setHandler("stop", () => pauseSong());

    return () => {
      setHandler("play", null);
      setHandler("pause", null);
      setHandler("previoustrack", null);
      setHandler("nexttrack", null);
      setHandler("seekbackward", null);
      setHandler("seekforward", null);
      setHandler("seekto", null);
      setHandler("stop", null);
    };
  }, [
    currentSong,
    duration,
    isPlaying,
    pauseSong,
    playNext,
    playPrevious,
    playbackQueue.length,
    queueIndex,
    resumeSong,
    seekTo,
    settings.seekStepSeconds,
  ]);

  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !("mediaSession" in navigator) ||
      !currentSong
    ) {
      lastMediaSessionPositionRef.current = 0;
      lastMediaSessionPositionUpdateRef.current = 0;
      return;
    }

    const effectiveDuration = duration || currentSong.duration || 0;
    if (!Number.isFinite(effectiveDuration) || effectiveDuration <= 0) {
      return;
    }

    const safePosition = Math.min(
      Math.max(currentTime, 0),
      Math.max(effectiveDuration, 0)
    );
    const now = Date.now();
    const elapsedMs = now - lastMediaSessionPositionUpdateRef.current;
    const deltaSeconds = Math.abs(
      safePosition - lastMediaSessionPositionRef.current
    );
    const shouldForceUpdate =
      !isPlaying ||
      safePosition <= PLAYBACK_PROGRESS_MIN_DELTA_SECONDS ||
      Math.abs(effectiveDuration - safePosition) <=
        MEDIA_SESSION_POSITION_MIN_DELTA_SECONDS;

    if (
      !shouldForceUpdate &&
      elapsedMs < MEDIA_SESSION_POSITION_UPDATE_MS &&
      deltaSeconds < MEDIA_SESSION_POSITION_MIN_DELTA_SECONDS
    ) {
      return;
    }

    try {
      navigator.mediaSession.setPositionState?.({
        duration: effectiveDuration,
        playbackRate: 1,
        position: safePosition,
      });
      lastMediaSessionPositionRef.current = safePosition;
      lastMediaSessionPositionUpdateRef.current = now;
    } catch (error) {
      // #region debug-point H1:media-session-position-error
      reportDebugEvent(
        playbackRunIdRef.current,
        "H1",
        "app/contexts/AudioContext.tsx:media-session-position-error",
        "[DEBUG] media session setPositionState failed",
        {
          songId: currentSong.id,
          error:
            error instanceof Error ? error.message : String(error || "unknown"),
        }
      );
      // #endregion
    }
  }, [currentSong, currentTime, duration, isPlaying]);

  useEffect(() => {
    if (!currentSong && !playbackError && !showAutoRetryPrompt) return;

    // #region debug-point H2:playback-ui-state
    reportDebugEvent(
      playbackRunIdRef.current,
      "H2",
      "app/contexts/AudioContext.tsx:playback-ui-state",
      "[DEBUG] playback ui state changed",
      {
        songId: currentSong?.id || null,
        isPlaying,
        isSongLoading,
        playbackError,
        showAutoRetryPrompt,
        autoRetryStatusMessage,
        hasFocus:
          typeof document !== "undefined" &&
          typeof document.hasFocus === "function"
            ? document.hasFocus()
            : null,
        hidden: typeof document !== "undefined" ? document.hidden : null,
        visibilityState:
          typeof document !== "undefined" ? document.visibilityState : null,
      }
    );
    // #endregion
  }, [
    autoRetryStatusMessage,
    currentSong,
    isPlaying,
    isSongLoading,
    playbackError,
    showAutoRetryPrompt,
  ]);

  const value = useMemo<AudioContextType>(
    () => ({
      currentSong,
      recentSongs,
      playbackQueue,
      queueIndex,
      isPlaying,
      isSongLoading,
      currentTime,
      duration,
      volume,
      isRepeat,
      beginSongLoad,
      playSong,
      resolveAndPlaySong,
      clearSongLoading,
      pauseSong,
      resumeSong,
      seekTo,
      setVolume,
      toggleRepeat,
      playNext,
      playPrevious,
      playQueueIndex,
      isFullscreenOpen,
      openFullscreen,
      closeFullscreen,
      audioRef,
      playbackError,
      isPlayerVisible: currentSong !== null,
      autoRetryPreference,
      showAutoRetryPrompt,
      isAutoRetrying,
      autoRetryStatusMessage,
      enableAutoRetry,
      disableAutoRetry,
      resetAutoRetryPreference,
      dismissAutoRetryPrompt,
    }),
    [
      currentSong,
      recentSongs,
      playbackQueue,
      queueIndex,
      isPlaying,
      isSongLoading,
      currentTime,
      duration,
      volume,
      isRepeat,
      beginSongLoad,
      playSong,
      resolveAndPlaySong,
      pauseSong,
      resumeSong,
      seekTo,
      setVolume,
      toggleRepeat,
      playNext,
      playPrevious,
      playQueueIndex,
      isFullscreenOpen,
      openFullscreen,
      closeFullscreen,
      playbackError,
      autoRetryPreference,
      showAutoRetryPrompt,
      isAutoRetrying,
      autoRetryStatusMessage,
      enableAutoRetry,
      disableAutoRetry,
      resetAutoRetryPreference,
      dismissAutoRetryPrompt,
    ]
  );

  // Browser-console diagnostic so the user can verify the proxy is
  // reachable, that CORS works, and that the upstream license server
  // is reachable from this Next.js server. Usage (in DevTools):
  //   await __streamifyTestLicenseProxy("https://license.media-streaming.soundcloud.cloud/playback/widevine?license_token=...")
  useEffect(() => {
    if (typeof window === "undefined") return;
    type WindowWithTest = Window & {
      __streamifyTestLicenseProxy?: (licenseUrl?: string) => Promise<{
        proxyReachable: boolean;
        proxyInfo?: unknown;
        upstreamReachable: boolean;
        upstreamStatus: number | null;
        upstreamContentType: string | null;
        postReachable: boolean;
        postStatus: number | null;
        postBodyBytes: number | null;
        notes: string[];
      }>;
    };
    const win = window as WindowWithTest;

    win.__streamifyTestLicenseProxy = async (licenseUrl) => {
      const notes: string[] = [];
      const out = {
        proxyReachable: false,
        proxyInfo: undefined as unknown,
        upstreamReachable: false,
        upstreamStatus: null as number | null,
        upstreamContentType: null as string | null,
        postReachable: false,
        postStatus: null as number | null,
        postBodyBytes: null as number | null,
        notes,
      };

      try {
        const probe = await fetch("/api/license-proxy", {
          method: "GET",
          cache: "no-store",
        });
        out.proxyReachable = probe.ok;
        out.proxyInfo = await probe.json();
        notes.push(
          `Proxy route is ${probe.ok ? "reachable" : "unreachable"} (${
            probe.status
          })`
        );
      } catch (e) {
        notes.push(`Proxy route fetch failed: ${String(e)}`);
      }

      if (licenseUrl) {
        try {
          const diag = await fetch(
            `/api/license-proxy?url=${encodeURIComponent(licenseUrl)}`,
            { method: "GET", cache: "no-store" }
          );
          const json = (await diag.json()) as {
            ok?: boolean;
            status?: number;
            contentType?: string | null;
          };
          out.upstreamReachable = Boolean(json.ok);
          out.upstreamStatus = json.status ?? null;
          out.upstreamContentType = json.contentType ?? null;
          notes.push(
            `Upstream HEAD: status=${json.status} contentType=${json.contentType}`
          );
        } catch (e) {
          notes.push(`Upstream diagnostic fetch failed: ${String(e)}`);
        }

        // Test the actual POST path with a small dummy body. We don't send
        // a real Widevine message, so the upstream will likely reject, but
        // a clear rejection (HTTP 400/401/403) proves the proxy pipeline
        // (body forwarding, headers, upstream connection) is wired up.
        try {
          const dummy = new Uint8Array(64);
          if (typeof crypto !== "undefined" && crypto.getRandomValues) {
            crypto.getRandomValues(dummy);
          }
          const post = await fetch(
            `/api/license-proxy?url=${encodeURIComponent(
              licenseUrl
            )}&_t=${Date.now()}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/octet-stream" },
              body: dummy,
              cache: "no-store",
            }
          );
          out.postReachable = true;
          out.postStatus = post.status;
          const buf = await post.arrayBuffer();
          out.postBodyBytes = buf.byteLength;
          notes.push(
            `POST path returned ${post.status} with ${buf.byteLength} bytes (an HTTP status from the upstream, not a network error, means the proxy pipeline is working)`
          );
        } catch (e) {
          notes.push(`POST path fetch failed: ${String(e)}`);
        }
      } else {
        notes.push(
          "Pass the SoundCloud license URL as an argument to also test the upstream connection, e.g. __streamifyTestLicenseProxy('https://license.media-streaming.soundcloud.cloud/playback/widevine?license_token=...')"
        );
      }

      console.log("[streamify] license proxy test", out);
      return out;
    };
  }, []);

  return (
    <AudioContext.Provider value={value}>
      {children}
      <iframe
        ref={soundCloudWidgetIframeRef}
        title="SoundCloud Widget"
        className="hidden"
        allow="autoplay; encrypted-media"
        src="about:blank"
      />
      <audio
        ref={audioRef}
        className="hidden"
        crossOrigin="anonymous"
        preload="auto"
      />
    </AudioContext.Provider>
  );
};
