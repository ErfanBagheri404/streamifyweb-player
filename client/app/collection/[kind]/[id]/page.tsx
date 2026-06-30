"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { SearchResult } from "../../../components/search";
import { type Song, useAudio } from "../../../contexts/AudioContext";
import { useSettings } from "../../../contexts/SettingsContext";
import { useToast } from "../../../contexts/ToastContext";
import {
  createStoredPlaylist,
  findStoredPlaylistForSourceCollection,
  isSongLiked,
  LOCAL_LIBRARY_UPDATED_EVENT,
  moveSongInStoredPlaylist,
  readLikedSongs,
  readLocalCollection,
  readStoredPlaylists,
  removeSongFromStoredPlaylist,
  removeStoredPlaylist,
  renameStoredPlaylist,
  toggleLikedSong,
} from "../../../lib/local-library";
import { isLightAppTheme } from "../../../lib/app-settings";
import {
  readSessionCache,
  writeSessionCache,
} from "../../../lib/session-cache";
import { useAppLanguage } from "../../../hooks/useAppLanguage";
import { usePageLoadingToast } from "../../../hooks/usePageLoadingToast";
import { buildBackendRouteUrlAsync } from "../../../lib/backend-api";
import { findSavedCollectionRouteContext } from "../../../lib/navigation-state";
import { normalizeYouTubeThumbnailUrl } from "../../../lib/youtube-thumbnails";
import PlaylistCreateModal from "../../../components/PlaylistCreateModal";

function reportDebugEvent(
  _runId: string,
  _hypothesisId: string,
  _location: string,
  _msg: string,
  _data: Record<string, unknown>
) {}

type CollectionEntry = {
  id: string;
  title: string;
  subtitle?: string;
  thumbnailUrl?: string;
  duration?: number;
  artist?: string;
  url?: string;
  album?: string;
  addedAt?: string;
};

type CollectionPayload = {
  collection: {
    id: string;
    title: string;
    author?: string;
    thumbnailUrl?: string;
    url?: string;
    count?: number;
    source?: string;
    description?: string;
  };
  entries: CollectionEntry[];
};

type CachedRemoteCollectionState = {
  collection: CollectionPayload["collection"] | null;
  entries: CollectionEntry[];
};

const COLLECTION_PAGE_CACHE_TTL_MS = 15 * 60 * 1000;

function isYouTubeCollectionSource(source?: string): boolean {
  const normalized = (source || "").trim().toLowerCase();
  return normalized === "youtube" || normalized === "youtubemusic";
}

function resolveEntryCoverUrl(
  entry: Pick<CollectionEntry, "thumbnailUrl">
): string | undefined {
  const entryCoverUrl = entry.thumbnailUrl?.trim();
  if (entryCoverUrl) return entryCoverUrl;
  return undefined;
}

function getCollectionPageCacheKey(
  id: string,
  kind: string,
  source: string
): string {
  return `collection-page:v2:${source || "default"}:${kind}:${id}`;
}

function readStoredCollectionItem(
  id: string,
  kind: string,
  source: string
): SearchResult | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const savedSearch = window.localStorage.getItem("lastSearch");
    if (!savedSearch) return null;

    const parsed = JSON.parse(savedSearch) as { results?: SearchResult[] };
    return (
      parsed.results?.find(
        (entry) =>
          entry.id === id &&
          entry.type === kind &&
          (source ? entry.source === source : true)
      ) || null
    );
  } catch (error) {
    console.error("Failed to restore collection details:", error);
    return null;
  }
}

function formatDuration(seconds?: number): string {
  if (!seconds || Number.isNaN(seconds)) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatCollectionRuntime(seconds: number): string {
  if (!seconds) return "";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours <= 0) {
    return `${minutes} min`;
  }

  if (minutes <= 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} min`;
}

function formatCount(count: number): string {
  return new Intl.NumberFormat("en-US").format(count);
}

function formatDateAdded(value?: string): string {
  if (!value) return "Recently";

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }

  return value;
}

function shortenDescription(value?: string, maxLength = 160): string {
  const normalized = value?.replace(/\s+/g, " ").trim() || "";
  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }

  const truncated = normalized.slice(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(" ");
  const safeText =
    lastSpaceIndex > Math.floor(maxLength * 0.6)
      ? truncated.slice(0, lastSpaceIndex)
      : truncated;

  return `${safeText.trimEnd()}...`;
}

function getSourceLabel(source?: string): string {
  switch ((source || "").toLowerCase()) {
    case "local":
      return "Your Library";
    case "youtubemusic":
      return "YouTube Music";
    case "youtube":
      return "YouTube";
    case "soundcloud":
      return "SoundCloud";
    case "jiosaavn":
      return "JioSaavn";
    default:
      return "Collection";
  }
}

function isPlayableSource(source?: string): boolean {
  return ["youtube", "youtubemusic", "soundcloud", "jiosaavn"].includes(
    (source || "").toLowerCase()
  );
}

function PlayGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M8.75 6.6c0-1.01 1.11-1.63 1.98-1.1l7.61 4.65a1.3 1.3 0 0 1 0 2.2l-7.61 4.65c-.87.53-1.98-.09-1.98-1.1V6.6Z" />
    </svg>
  );
}

function HeartGlyph({
  filled = false,
  className = "h-5 w-5",
}: {
  filled?: boolean;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20.25s-7.5-4.35-7.5-10.125A4.125 4.125 0 0 1 8.625 6a4.68 4.68 0 0 1 3.375 1.575A4.68 4.68 0 0 1 15.375 6 4.125 4.125 0 0 1 19.5 10.125C19.5 15.9 12 20.25 12 20.25Z"
      />
    </svg>
  );
}

function PencilGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.86 4.49 2.65 2.65M7.5 18.5l-3.75.75.75-3.75L15.8 4.2a1.87 1.87 0 0 1 2.65 0l1.35 1.35a1.87 1.87 0 0 1 0 2.65L8.5 19.5Z"
      />
    </svg>
  );
}

function MoreGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.75 7.75h14.5M9.25 10.75v5.5M14.75 10.75v5.5M8 4.75h8l.75 3H7.25l.75-3Zm-.75 3h9.5l-.6 10.02a1.5 1.5 0 0 1-1.5 1.41H9.35a1.5 1.5 0 0 1-1.5-1.41L7.25 7.75Z"
      />
    </svg>
  );
}

function ClockGlyph() {
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
      <circle cx="12" cy="12" r="8.25" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 7.75v4.75l3.25 1.75"
      />
    </svg>
  );
}

function SearchGlyph() {
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
      <circle cx="11" cy="11" r="6.5" />
      <path strokeLinecap="round" d="m16 16 4 4" />
    </svg>
  );
}

function EqualizerGlyph() {
  return (
    <div className="flex h-4 items-end gap-[2px]" aria-hidden="true">
      <span className="h-2 w-[3px] animate-pulse rounded-full bg-[color:var(--theme-accent)]" />
      <span className="h-4 w-[3px] animate-pulse rounded-full bg-[color:var(--theme-accent)] [animation-delay:120ms]" />
      <span className="h-3 w-[3px] animate-pulse rounded-full bg-[color:var(--theme-accent)] [animation-delay:240ms]" />
    </div>
  );
}

function DragHandleGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="9" cy="6.5" r="1.3" />
      <circle cx="15" cy="6.5" r="1.3" />
      <circle cx="9" cy="12" r="1.3" />
      <circle cx="15" cy="12" r="1.3" />
      <circle cx="9" cy="17.5" r="1.3" />
      <circle cx="15" cy="17.5" r="1.3" />
    </svg>
  );
}

function LikedCollectionCover({ title }: { title: string }) {
  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-md text-white shadow-[0_18px_40px_rgba(95,75,255,0.35)]"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--theme-accent) 86%, white 14%) 0%, color-mix(in srgb, var(--theme-accent) 62%, #7c3aed 38%) 48%, color-mix(in srgb, var(--surface-2) 80%, black 20%) 100%)",
      }}
      aria-label={title}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.34),transparent_34%)]" />
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-10 w-10"
        aria-hidden="true"
      >
        <path d="M12 21.35 10.55 20C5.4 15.24 2 12.09 2 8.22 2 5.07 4.42 2.65 7.57 2.65c1.78 0 3.49.82 4.43 2.12.94-1.3 2.65-2.12 4.43-2.12C19.58 2.65 22 5.07 22 8.22c0 3.87-3.4 7.02-8.55 11.78L12 21.35Z" />
      </svg>
    </div>
  );
}

function PreviouslyPlayedCollectionCover({ title }: { title: string }) {
  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-md text-white shadow-[0_18px_40px_rgba(20,70,120,0.32)]"
      style={{
        background:
          "linear-gradient(135deg, #245d8f 0%, #1a4b70 52%, #121212 100%)",
      }}
      aria-label={title}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_34%)]" />
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-10 w-10"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="8.25" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 7.75v4.75l3.25 1.75"
        />
      </svg>
    </div>
  );
}

function getCollectionEntries(item: SearchResult | null): CollectionEntry[] {
  if (!item) return [];

  if (Array.isArray(item.videos) && item.videos.length > 0) {
    return item.videos.map((video, index) => ({
      id: video.videoId || video.id || `${item.id}-${index}`,
      title: video.title || `Track ${index + 1}`,
      thumbnailUrl: normalizeYouTubeThumbnailUrl({
        url: video.videoThumbnails?.[0]?.url,
        videoId: video.videoId || video.id,
      }),
      duration: video.lengthSeconds,
      artist: item.author,
      subtitle: item.author,
      album: item.title,
    }));
  }

  if (Array.isArray(item.tracks) && item.tracks.length > 0) {
    return item.tracks.map((track, index) => ({
      id: String(track.id || `${item.id}-${index}`),
      title: track.title || `Track ${index + 1}`,
      subtitle: track.user?.username,
      artist: track.user?.username,
      thumbnailUrl: track.artwork_url || track.user?.avatar_url,
      duration:
        typeof track.duration === "string"
          ? Number.parseInt(track.duration, 10)
          : typeof track.duration === "number"
          ? Math.floor(track.duration / 1000)
          : undefined,
      url: track.permalink_url,
      album: item.title,
      addedAt: (track as { created_at?: string }).created_at,
    }));
  }

  return [];
}

function getSongPreferenceKey(songId: string, source?: string): string {
  return `${(source || "unknown").trim().toLowerCase()}:${songId}`;
}

function toSongSnapshot(
  entry: CollectionEntry,
  fallback: {
    artist?: string;
    source?: string;
  }
): Song {
  return {
    id: entry.id,
    title: entry.title,
    artist:
      entry.artist || entry.subtitle || fallback.artist || "Unknown Artist",
    coverUrl: resolveEntryCoverUrl(entry),
    duration: entry.duration,
    source: fallback.source,
    url: entry.url,
    uploaded: entry.addedAt,
  };
}

function matchesCollectionEntrySong(
  entry: CollectionEntry,
  song: Song
): boolean {
  if (song.id !== entry.id) return false;

  const normalizedEntryTitle = entry.title.trim().toLowerCase();
  const normalizedSongTitle = song.title.trim().toLowerCase();
  if (normalizedEntryTitle && normalizedSongTitle) {
    return normalizedEntryTitle === normalizedSongTitle;
  }

  return true;
}

export default function CollectionPage() {
  const router = useRouter();
  const params = useParams<{ kind: string; id: string }>();
  const searchParams = useSearchParams();
  const { currentSong, isPlaying, resolveAndPlaySong } = useAudio();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const {
    t,
    formatNumber,
    formatDate,
    getSourceLabel: getLocalizedSourceLabel,
  } = useAppLanguage();

  const kind = params.kind === "album" ? "album" : "playlist";
  const id = decodeURIComponent(params.id);
  const savedRouteContext = useMemo(
    () => findSavedCollectionRouteContext(id, kind),
    [id, kind]
  );
  const source = searchParams.get("source") || savedRouteContext?.source || "";
  const sourceUrl = searchParams.get("url") || "";
  const title = savedRouteContext?.title || "Untitled";
  const author = savedRouteContext?.author || "";
  const image = savedRouteContext?.image || "";
  const href = savedRouteContext?.href || "";
  const count = savedRouteContext?.count || "";
  const runId = useMemo(() => `pre-${Date.now()}`, []);

  const storedItem = useMemo(
    () => readStoredCollectionItem(id, kind, source),
    [id, kind, source]
  );
  const collectionCacheKey = useMemo(
    () => getCollectionPageCacheKey(id, kind, source),
    [id, kind, source]
  );
  const cachedRemoteCollection = useMemo(
    () =>
      readSessionCache<CachedRemoteCollectionState>(
        collectionCacheKey,
        COLLECTION_PAGE_CACHE_TTL_MS
      ),
    [collectionCacheKey]
  );
  const storedEntries = useMemo(
    () => getCollectionEntries(storedItem),
    [storedItem]
  );

  const [remoteState, setRemoteState] = useState<{
    collection: CollectionPayload["collection"] | null;
    entries: CollectionEntry[];
    error: string | null;
    isLoading: boolean;
  }>({
    collection: cachedRemoteCollection?.collection || null,
    entries: cachedRemoteCollection?.entries || [],
    error: null,
    isLoading: !cachedRemoteCollection,
  });
  const [loadingSongId, setLoadingSongId] = useState<string | null>(null);
  const [localLibraryVersion, setLocalLibraryVersion] = useState(0);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [collectionQuery, setCollectionQuery] = useState("");
  const [draggedEntryIndex, setDraggedEntryIndex] = useState<number | null>(
    null
  );
  const [dragOverEntryIndex, setDragOverEntryIndex] = useState<number | null>(
    null
  );
  const [isPlaylistActionsOpen, setIsPlaylistActionsOpen] = useState(false);
  const [selectedEntryAction, setSelectedEntryAction] = useState<{
    entry: CollectionEntry;
    index: number;
  } | null>(null);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renamePlaylistName, setRenamePlaylistName] = useState("");
  const [renamePlaylistDescription, setRenamePlaylistDescription] =
    useState("");
  const suppressRowClickRef = useRef(false);
  const collectionSearchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleLocalLibraryUpdated = () => {
      setLocalLibraryVersion((value) => value + 1);
    };

    window.addEventListener(
      LOCAL_LIBRARY_UPDATED_EVENT,
      handleLocalLibraryUpdated
    );
    window.addEventListener("storage", handleLocalLibraryUpdated);

    return () => {
      window.removeEventListener(
        LOCAL_LIBRARY_UPDATED_EVENT,
        handleLocalLibraryUpdated
      );
      window.removeEventListener("storage", handleLocalLibraryUpdated);
    };
  }, []);

  const localCollection = useMemo(
    () => (source.toLowerCase() === "local" ? readLocalCollection(id) : null),
    [id, localLibraryVersion, source]
  );
  const storedPlaylists = useMemo(
    () => readStoredPlaylists(),
    [localLibraryVersion]
  );
  const likedSongKeys = useMemo(
    () =>
      new Set(
        readLikedSongs().map((song) =>
          getSongPreferenceKey(song.id, song.source)
        )
      ),
    [localLibraryVersion]
  );

  useEffect(() => {
    setRemoteState({
      collection: cachedRemoteCollection?.collection || null,
      entries: cachedRemoteCollection?.entries || [],
      error: null,
      isLoading: !cachedRemoteCollection,
    });
  }, [cachedRemoteCollection, collectionCacheKey]);

  const shouldFetchRemote = useMemo(() => {
    const lowerSource = source.toLowerCase();
    return Boolean(
      (lowerSource === "jiosaavn" &&
        (kind === "album" || kind === "playlist")) ||
        ((lowerSource === "youtube" || lowerSource === "youtubemusic") &&
          kind === "playlist") ||
        (lowerSource === "soundcloud" &&
          (kind === "playlist" || kind === "album"))
    );
  }, [kind, source]);
  const shouldHideStoredEntriesWhileFetching = useMemo(
    () =>
      shouldFetchRemote &&
      isYouTubeCollectionSource(source) &&
      !cachedRemoteCollection,
    [cachedRemoteCollection, shouldFetchRemote, source]
  );

  usePageLoadingToast({
    enabled: shouldFetchRemote,
    isLoading: remoteState.isLoading,
    message: t("common.loading"),
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!shouldFetchRemote) {
        if (!cancelled) {
          setRemoteState({
            collection: null,
            entries: [],
            error: null,
            isLoading: false,
          });
        }
        return;
      }

      if (cachedRemoteCollection) {
        if (!cancelled) {
          setRemoteState({
            collection: cachedRemoteCollection.collection,
            entries: cachedRemoteCollection.entries,
            error: null,
            isLoading: false,
          });
        }
        return;
      }

      setRemoteState((previous) => ({
        ...previous,
        error: null,
        isLoading:
          previous.entries.length === 0 &&
          previous.collection == null &&
          (storedEntries.length === 0 || shouldHideStoredEntriesWhileFetching),
      }));

      try {
        const params = new URLSearchParams();
        params.set("id", id);
        params.set("kind", kind);
        params.set("source", source);
        const resolvedCollectionUrl =
          sourceUrl ||
          href ||
          storedItem?.href ||
          storedItem?.url ||
          (source.toLowerCase() === "soundcloud" ? id : "");
        if (resolvedCollectionUrl) {
          params.set("url", resolvedCollectionUrl);
        }

        // #region debug-point A:collection-page-fetch-start
        reportDebugEvent(
          runId,
          "A",
          "app/collection/[kind]/[id]/page.tsx:run:start",
          "[DEBUG] collection page requesting remote collection",
          {
            id,
            kind,
            source,
            sourceUrl,
            href,
            storedHref: storedItem?.href || null,
            storedUrl: storedItem?.url || null,
            requestParams: params.toString(),
          }
        );
        // #endregion

        const response = await fetch(
          await buildBackendRouteUrlAsync("/collection", {
            searchParams: params,
          })
        );
        const json = (await response.json()) as Record<string, unknown>;

        // #region debug-point B:collection-page-fetch-response
        reportDebugEvent(
          runId,
          "B",
          "app/collection/[kind]/[id]/page.tsx:run:response",
          "[DEBUG] collection page received remote response",
          {
            id,
            kind,
            source,
            status: response.status,
            ok: response.ok,
            error: typeof json.error === "string" ? json.error : null,
            collectionId:
              json.collection &&
              typeof json.collection === "object" &&
              typeof (json.collection as { id?: unknown }).id === "string"
                ? (json.collection as { id: string }).id
                : null,
            entryCount: Array.isArray(json.entries)
              ? json.entries.length
              : null,
          }
        );
        // #endregion

        if (!response.ok) {
          throw new Error(
            typeof json.error === "string"
              ? json.error
              : "Failed to load collection"
          );
        }

        if (!cancelled) {
          const nextState = {
            collection:
              (json.collection as CollectionPayload["collection"]) || null,
            entries: Array.isArray(json.entries)
              ? (json.entries as CollectionEntry[])
              : [],
          };
          writeSessionCache(collectionCacheKey, nextState);
          setRemoteState({
            ...nextState,
            error: null,
            isLoading: false,
          });
        }
      } catch (error) {
        // #region debug-point C:collection-page-fetch-error
        reportDebugEvent(
          runId,
          "C",
          "app/collection/[kind]/[id]/page.tsx:run:error",
          "[DEBUG] collection page failed to load remote collection",
          {
            id,
            kind,
            source,
            href,
            storedHref: storedItem?.href || null,
            storedUrl: storedItem?.url || null,
            error: error instanceof Error ? error.message : String(error),
          }
        );
        // #endregion
        if (!cancelled) {
          setRemoteState({
            collection: null,
            entries: [],
            error:
              error instanceof Error
                ? error.message
                : "Failed to load collection",
            isLoading: false,
          });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    cachedRemoteCollection,
    collectionCacheKey,
    href,
    id,
    kind,
    shouldFetchRemote,
    shouldHideStoredEntriesWhileFetching,
    source,
    sourceUrl,
    storedItem?.href,
    storedItem?.url,
    storedEntries.length,
  ]);

  const entries = useMemo(() => {
    if (localCollection) {
      return localCollection.songs.map((song, index) => ({
        id: song.id || `${id}-${index}`,
        title: song.title,
        subtitle: song.artist,
        thumbnailUrl: song.coverUrl,
        duration: song.duration,
        artist: song.artist,
        url: song.url,
        album: localCollection.collection.title,
        addedAt: song.uploaded,
      }));
    }
    if (remoteState.entries.length > 0) return remoteState.entries;
    if (shouldHideStoredEntriesWhileFetching) return [];
    return storedEntries;
  }, [
    id,
    localCollection,
    remoteState.entries,
    shouldHideStoredEntriesWhileFetching,
    storedEntries,
  ]);

  const backParams = new URLSearchParams();
  const searchQuery = searchParams.get("search_query");
  const searchSource = searchParams.get("search_source");
  const searchFilter = searchParams.get("search_filter");
  if (searchQuery) backParams.set("q", searchQuery);
  if (searchSource) backParams.set("source", searchSource);
  if (searchFilter) backParams.set("filter", searchFilter);
  const backHref =
    source.toLowerCase() === "local"
      ? "/library"
      : `/search${backParams.toString() ? `?${backParams.toString()}` : ""}`;

  const displayTitle =
    localCollection?.collection.title ||
    remoteState.collection?.title ||
    storedItem?.title ||
    title ||
    "Untitled";
  const displayAuthor =
    localCollection?.collection.author ||
    remoteState.collection?.author ||
    storedItem?.author ||
    author;
  const displayDescription = shortenDescription(
    localCollection?.collection.description ||
      remoteState.collection?.description ||
      (storedItem as (SearchResult & { description?: string }) | null)
        ?.description ||
      ""
  );
  const displayImage =
    localCollection?.collection.thumbnailUrl ||
    remoteState.collection?.thumbnailUrl ||
    storedItem?.thumbnailUrl ||
    storedItem?.img ||
    image;
  const collectionSource =
    localCollection?.collection.source ||
    remoteState.collection?.source ||
    storedItem?.source ||
    source;
  const savedRemotePlaylist = useMemo(
    () =>
      source.toLowerCase() === "local"
        ? null
        : findStoredPlaylistForSourceCollection(id, kind, collectionSource),
    [collectionSource, id, kind, localLibraryVersion, source]
  );

  const totalRuntime = useMemo(
    () =>
      entries.reduce(
        (total, entry) =>
          total + (typeof entry.duration === "number" ? entry.duration : 0),
        0
      ),
    [entries]
  );
  const normalizedCollectionQuery = collectionQuery.trim().toLowerCase();
  const filteredEntries = useMemo(() => {
    if (!normalizedCollectionQuery) return entries;

    return entries.filter((entry) =>
      [entry.title, entry.artist, entry.subtitle, entry.album]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedCollectionQuery)
    );
  }, [entries, normalizedCollectionQuery]);

  const displayCountText =
    entries.length > 0
      ? t("collection.songCount", { count: formatNumber(entries.length) })
      : localCollection?.collection.count != null
      ? t("collection.itemsCount", {
          count: formatNumber(localCollection.collection.count),
        })
      : remoteState.collection?.count != null
      ? t("collection.itemsCount", {
          count: formatNumber(remoteState.collection.count),
        })
      : count
      ? t("collection.itemsCount", { count })
      : "";

  const localizedRuntime = (() => {
    if (!totalRuntime) return "";

    const hours = Math.floor(totalRuntime / 3600);
    const minutes = Math.round((totalRuntime % 3600) / 60);

    if (hours <= 0) {
      return t("collection.min", { count: minutes });
    }

    if (minutes <= 0) {
      return t("collection.hr", { count: hours });
    }

    return t("collection.hrMin", { hours, minutes });
  })();

  const metaParts = [
    collectionSource.toLowerCase() === "local"
      ? t("collection.yourLibrary")
      : collectionSource.toLowerCase() === "youtube"
      ? getLocalizedSourceLabel("youtube")
      : collectionSource.toLowerCase() === "youtubemusic"
      ? getLocalizedSourceLabel("youtubemusic")
      : collectionSource.toLowerCase() === "soundcloud"
      ? getLocalizedSourceLabel("soundcloud")
      : collectionSource.toLowerCase() === "jiosaavn"
      ? getLocalizedSourceLabel("jiosaavn")
      : t("collection.collection"),
    displayCountText,
    localizedRuntime,
  ].filter(Boolean);

  const canPlayEntries =
    collectionSource.toLowerCase() === "local" ||
    isPlayableSource(collectionSource);
  const isLikedSongsCollection =
    source.toLowerCase() === "local" && id === "liked-songs";
  const isPreviouslyPlayedCollection =
    source.toLowerCase() === "local" && id === "previously-played";
  const useHeroLightText =
    (Boolean(displayImage) || isLikedSongsCollection) &&
    !isLightAppTheme(settings.theme);
  const isRemovableLocalPlaylist =
    source.toLowerCase() === "local" &&
    kind === "playlist" &&
    id !== "liked-songs" &&
    id !== "previously-played" &&
    Boolean(localCollection);
  const canReorderLocalPlaylist = isRemovableLocalPlaylist;
  const canLikeCollection =
    kind === "playlist" &&
    source.toLowerCase() !== "local" &&
    !savedRemotePlaylist;
  const canRenamePlaylist = isRemovableLocalPlaylist;
  const canOpenPlaylistActions =
    canLikeCollection ||
    canRenamePlaylist ||
    isRemovableLocalPlaylist ||
    entries.length > 0;

  useEffect(() => {
    setDraggedEntryIndex(null);
    setDragOverEntryIndex(null);
  }, [entries.length]);

  const handleEntryPress = async (entry: CollectionEntry) => {
    if (!canPlayEntries || loadingSongId === entry.id) return;

    setLoadingSongId(entry.id);

    try {
      if (localCollection) {
        const queue = localCollection.songs.map((song) => ({ ...song }));
        const currentIndex = queue.findIndex((song) => song.id === entry.id);
        const selectedSong =
          queue[currentIndex >= 0 ? currentIndex : 0] || queue[0];

        if (selectedSong) {
          await resolveAndPlaySong(selectedSong, {
            queue,
            currentIndex: currentIndex >= 0 ? currentIndex : 0,
          });
        }
      } else {
        const queue: Song[] = entries.map((item) =>
          toSongSnapshot(item, {
            artist: displayAuthor,
            source: collectionSource,
          })
        );

        const currentIndex = queue.findIndex((song) => song.id === entry.id);

        await resolveAndPlaySong(
          toSongSnapshot(entry, {
            artist: displayAuthor,
            source: collectionSource,
          }),
          {
            queue,
            currentIndex: currentIndex >= 0 ? currentIndex : 0,
          }
        );
      }
    } catch (error) {
      console.error("Failed to play collection entry:", error);
    } finally {
      setLoadingSongId((current) => (current === entry.id ? null : current));
    }
  };

  const handlePrimaryPlay = () => {
    if (!filteredEntries[0]) return;
    void handleEntryPress(filteredEntries[0]);
  };

  const focusCollectionSearch = () => {
    setIsPlaylistActionsOpen(false);
    window.setTimeout(() => {
      collectionSearchInputRef.current?.focus();
      collectionSearchInputRef.current?.select();
    }, 0);
  };

  const showFeedback = (
    message: string,
    tone: "success" | "error" = "success"
  ) => {
    showToast({
      message,
      tone,
      durationMs: 2200,
    });
  };

  const handleToggleCollectionLike = () => {
    if (!canLikeCollection) return;

    if (savedRemotePlaylist) {
      showFeedback(t("collection.alreadyInLibrary"));
      return;
    }

    const playlist = createStoredPlaylist(displayTitle, displayDescription, {
      songs: entries.map((entry) =>
        toSongSnapshot(entry, {
          artist: displayAuthor,
          source: collectionSource,
        })
      ),
      sourceCollectionId: id,
      sourceCollectionKind: kind,
      sourceCollectionSource: collectionSource,
      sourceCollectionUrl: sourceUrl || href || remoteState.collection?.url,
    });

    showToast({
      message: t("collection.addedToLibrary"),
      tone: "success",
      actionLabel: t("library.open"),
      onAction: () => {
        router.push(
          `/collection/playlist/${encodeURIComponent(playlist.id)}?source=local`
        );
      },
    });
  };

  const handleToggleEntryLike = (entry: CollectionEntry) => {
    const song =
      localCollection?.songs.find((storedSong) =>
        matchesCollectionEntrySong(entry, storedSong)
      ) ||
      toSongSnapshot(entry, {
        artist: displayAuthor,
        source: collectionSource,
      });
    const result = toggleLikedSong(song);
    showFeedback(
      result.liked
        ? t("fullscreen.addedToLiked")
        : t("fullscreen.removedFromLiked")
    );
  };

  const handleOpenRenameModal = () => {
    if (!canRenamePlaylist || !localCollection) return;
    setIsPlaylistActionsOpen(false);
    setRenamePlaylistName(localCollection.collection.title || displayTitle);
    setRenamePlaylistDescription(localCollection.collection.description || "");
    setIsRenameModalOpen(true);
  };

  const handleRenamePlaylist = () => {
    if (!canRenamePlaylist) return;
    const result = renameStoredPlaylist(
      id,
      renamePlaylistName,
      renamePlaylistDescription
    );
    if (!result.updated || !result.playlist) return;

    setIsRenameModalOpen(false);
    showFeedback(t("collection.renamedPlaylist"));
  };

  const handleDeletePlaylist = () => {
    const result = removeStoredPlaylist(id);
    if (!result.removed) {
      setIsDeleteModalOpen(false);
      return;
    }

    setIsDeleteModalOpen(false);
    router.replace("/library");
  };

  const handleRemoveEntryFromPlaylist = (entry: CollectionEntry) => {
    if (!isRemovableLocalPlaylist) return;

    const song =
      localCollection?.songs.find((storedSong) =>
        matchesCollectionEntrySong(entry, storedSong)
      ) ||
      toSongSnapshot(entry, {
        artist: displayAuthor,
        source: collectionSource,
      });
    const result = removeSongFromStoredPlaylist(id, song.id, song.source);
    if (!result.removed) {
      showFeedback(t("collection.couldNotRemoveFromPlaylist"), "error");
      return;
    }

    setSelectedEntryAction(null);
    showFeedback(t("collection.removedFromPlaylist"));
  };

  const handleReorderEntry = (fromIndex: number, toIndex: number) => {
    if (!canReorderLocalPlaylist || fromIndex === toIndex) return;
    moveSongInStoredPlaylist(id, fromIndex, toIndex);
  };

  const headerGridClass = canReorderLocalPlaylist
    ? "grid grid-cols-[24px_32px_minmax(0,1fr)_52px] gap-3 border-b border-[color:var(--border-subtle)] px-3 pb-3 text-[11px] uppercase tracking-[0.18em] text-[color:color-mix(in_srgb,var(--foreground)_45%,transparent)] sm:grid-cols-[24px_42px_minmax(0,1fr)_64px] md:grid-cols-[24px_42px_minmax(0,1.7fr)_minmax(0,1.05fr)_120px_64px]"
    : "grid grid-cols-[32px_minmax(0,1fr)_52px] gap-3 border-b border-[color:var(--border-subtle)] px-3 pb-3 text-[11px] uppercase tracking-[0.18em] text-[color:color-mix(in_srgb,var(--foreground)_45%,transparent)] sm:grid-cols-[42px_minmax(0,1fr)_64px] md:grid-cols-[42px_minmax(0,1.7fr)_minmax(0,1.05fr)_120px_64px]";
  const rowGridClass = canReorderLocalPlaylist
    ? "grid w-full grid-cols-[24px_32px_minmax(0,1fr)_52px] items-center gap-3 rounded-md px-3 py-2.5 text-left transition sm:grid-cols-[24px_42px_minmax(0,1fr)_64px] md:grid-cols-[24px_42px_minmax(0,1.7fr)_minmax(0,1.05fr)_120px_64px]"
    : "grid w-full grid-cols-[32px_minmax(0,1fr)_52px] items-center gap-3 rounded-md px-3 py-2.5 text-left transition sm:grid-cols-[42px_minmax(0,1fr)_64px] md:grid-cols-[42px_minmax(0,1.7fr)_minmax(0,1.05fr)_120px_64px]";

  return (
    <div className="theme-surface-strong relative h-full overflow-y-auto hide-scrollbar rounded-2xl border text-[color:var(--foreground)]">
      <div
        className={`fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm transition ${
          isDeleteModalOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsDeleteModalOpen(false)}
      >
        <div
          className={`theme-surface w-full max-w-md rounded-[28px] border p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)] transition ${
            isDeleteModalOpen ? "scale-100" : "scale-95"
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:color-mix(in_srgb,var(--foreground)_40%,transparent)]">
            {t("collection.removePlaylist")}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-[color:var(--foreground)]">
            {t("collection.deletePlaylist", { title: displayTitle })}
          </h2>
          <p className="mt-2 text-sm text-[color:color-mix(in_srgb,var(--foreground)_60%,transparent)]">
            {t("collection.removePlaylistDescription")}
          </p>
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(false)}
              className="rounded-full px-4 py-2 text-sm font-semibold text-[color:color-mix(in_srgb,var(--foreground)_65%,transparent)] transition hover:text-[color:var(--foreground)]"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleDeletePlaylist}
              className="rounded-full bg-[#f15e6c] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ff7280]"
            >
              {t("collection.removePlaylistAction")}
            </button>
          </div>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm transition ${
          isPlaylistActionsOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsPlaylistActionsOpen(false)}
      >
        <div
          className={`theme-surface w-full max-w-md rounded-[28px] border p-4 shadow-[0_30px_80px_rgba(0,0,0,0.45)] transition ${
            isPlaylistActionsOpen ? "scale-100" : "scale-95"
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:color-mix(in_srgb,var(--foreground)_40%,transparent)]">
            {t("collection.moreActions")}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-[color:var(--foreground)]">
            {displayTitle}
          </h2>
          <div className="mt-5 space-y-2">
            {entries.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setIsPlaylistActionsOpen(false);
                  handlePrimaryPlay();
                }}
                className="theme-button-soft flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition hover:text-[color:var(--foreground)]"
              >
                <span>{t("common.play")}</span>
                <PlayGlyph />
              </button>
            ) : null}
            {entries.length > 0 ? (
              <button
                type="button"
                onClick={focusCollectionSearch}
                className="theme-button-soft flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition hover:text-[color:var(--foreground)]"
              >
                <span>{t("common.search")}</span>
                <SearchGlyph />
              </button>
            ) : null}
            {canLikeCollection ? (
              <button
                type="button"
                onClick={() => {
                  setIsPlaylistActionsOpen(false);
                  handleToggleCollectionLike();
                }}
                className="theme-button-soft flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition hover:text-[color:var(--foreground)]"
              >
                <span>{t("collection.saveToLibrary")}</span>
                <HeartGlyph filled />
              </button>
            ) : null}
            {canRenamePlaylist ? (
              <button
                type="button"
                onClick={handleOpenRenameModal}
                className="theme-button-soft flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition hover:text-[color:var(--foreground)]"
              >
                <span>{t("collection.renamePlaylistAction")}</span>
                <PencilGlyph />
              </button>
            ) : null}
            {isRemovableLocalPlaylist ? (
              <button
                type="button"
                onClick={() => {
                  setIsPlaylistActionsOpen(false);
                  setIsDeleteModalOpen(true);
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-[#f15e6c]/30 bg-[#f15e6c]/10 px-4 py-3 text-left text-sm font-medium text-[#ff8b96] transition hover:bg-[#f15e6c]/15"
              >
                <span>{t("collection.removePlaylistAction")}</span>
                <TrashGlyph />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm transition ${
          selectedEntryAction
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={() => setSelectedEntryAction(null)}
      >
        <div
          className={`theme-surface w-full max-w-md rounded-[28px] border p-4 shadow-[0_30px_80px_rgba(0,0,0,0.45)] transition ${
            selectedEntryAction ? "scale-100" : "scale-95"
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:color-mix(in_srgb,var(--foreground)_40%,transparent)]">
            {selectedEntryAction
              ? t("collection.trackActions", {
                  number: String(selectedEntryAction.index + 1),
                })
              : t("collection.moreActions")}
          </p>
          <h2 className="mt-3 truncate text-2xl font-semibold text-[color:var(--foreground)]">
            {selectedEntryAction?.entry.title}
          </h2>
          <div className="mt-5 space-y-2">
            {selectedEntryAction ? (
              <button
                type="button"
                onClick={() => {
                  void handleEntryPress(selectedEntryAction.entry);
                  setSelectedEntryAction(null);
                }}
                className="theme-button-soft flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition hover:text-[color:var(--foreground)]"
              >
                <span>{t("collection.playTrack")}</span>
                <PlayGlyph />
              </button>
            ) : null}
            {selectedEntryAction ? (
              <button
                type="button"
                onClick={() => {
                  handleToggleEntryLike(selectedEntryAction.entry);
                  setSelectedEntryAction(null);
                }}
                className="theme-button-soft flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition hover:text-[color:var(--foreground)]"
              >
                <span>
                  {likedSongKeys.has(
                    getSongPreferenceKey(
                      selectedEntryAction.entry.id,
                      collectionSource
                    )
                  )
                    ? t("collection.unlikeSong")
                    : t("collection.likeSong")}
                </span>
                <HeartGlyph
                  filled={likedSongKeys.has(
                    getSongPreferenceKey(
                      selectedEntryAction.entry.id,
                      collectionSource
                    )
                  )}
                />
              </button>
            ) : null}
            {selectedEntryAction && isRemovableLocalPlaylist ? (
              <button
                type="button"
                onClick={() =>
                  handleRemoveEntryFromPlaylist(selectedEntryAction.entry)
                }
                className="flex w-full items-center justify-between rounded-2xl border border-[#f15e6c]/30 bg-[#f15e6c]/10 px-4 py-3 text-left text-sm font-medium text-[#ff8b96] transition hover:bg-[#f15e6c]/15"
              >
                <span>{t("collection.removeFromPlaylist")}</span>
                <TrashGlyph />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <section
        className={`relative shrink-0 overflow-hidden px-4 pb-8 pt-5 sm:px-5 md:px-8 md:pb-10 md:pt-6 ${
          useHeroLightText ? "theme-media-hero" : ""
        }`}
        style={{
          backgroundImage:
            "linear-gradient(180deg,var(--collection-hero-start) 0%,var(--collection-hero-mid) 42%,var(--collection-hero-end) 70%,var(--surface-2) 100%)",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at top left, rgba(255,255,255,0.22), transparent 32%), linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--surface-overlay) 38%, transparent) 55%, color-mix(in srgb, var(--surface-overlay) 88%, transparent) 100%)",
          }}
        />
        <div className="relative z-10">
          <Link
            href={backHref}
            className={`inline-flex rounded-full px-3 py-2 text-sm backdrop-blur-sm transition ${
              useHeroLightText
                ? "bg-black/25 text-white/82 hover:bg-black/35"
                : "theme-button-soft text-[color:color-mix(in_srgb,var(--foreground)_82%,transparent)] hover:text-[color:var(--foreground)]"
            }`}
          >
            {t("common.back")}
          </Link>

          <div className="mt-7 flex flex-col items-start gap-6 md:flex-row md:items-end">
            <div
              className={`h-36 w-36 overflow-hidden rounded-md shadow-[0_24px_60px_rgba(0,0,0,0.4)] sm:h-44 sm:w-44 md:h-56 md:w-56 ${
                useHeroLightText ? "bg-black/20" : "theme-surface-soft"
              }`}
            >
              {isLikedSongsCollection ? (
                <LikedCollectionCover title={displayTitle} />
              ) : isPreviouslyPlayedCollection ? (
                <PreviouslyPlayedCollectionCover title={displayTitle} />
              ) : displayImage ? (
                <Image
                  src={displayImage}
                  alt={displayTitle}
                  width={224}
                  height={224}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="h-full w-full" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p
                className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                  useHeroLightText
                    ? "text-white/80"
                    : "text-[color:color-mix(in_srgb,var(--foreground)_72%,transparent)]"
                }`}
              >
                {kind}
              </p>
              <h1
                className={`mt-3 text-3xl font-black tracking-tight sm:text-6xl lg:text-7xl ${
                  useHeroLightText
                    ? "text-white"
                    : "text-[color:var(--foreground)]"
                }`}
              >
                {displayTitle}
              </h1>
              {displayDescription ? (
                <p
                  className={`mt-4 max-w-3xl text-sm md:text-base ${
                    useHeroLightText
                      ? "text-white/75"
                      : "text-[color:color-mix(in_srgb,var(--foreground)_68%,transparent)]"
                  }`}
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {displayDescription}
                </p>
              ) : null}
              <div
                className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm md:text-base ${
                  useHeroLightText
                    ? "text-white/78"
                    : "text-[color:color-mix(in_srgb,var(--foreground)_72%,transparent)]"
                }`}
              >
                {displayAuthor ? (
                  <span className="font-semibold">{displayAuthor}</span>
                ) : null}
                {metaParts.length > 0 ? (
                  <span>{metaParts.join(" • ")}</span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-10 pt-6 sm:px-5 md:px-8">
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={handlePrimaryPlay}
            disabled={!entries[0] || !canPlayEntries}
            className="theme-button-accent flex h-14 w-14 items-center justify-center rounded-full transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            aria-label={t("collection.playCollection")}
          >
            <PlayGlyph className="h-6 w-6" />
          </button>
          {canLikeCollection ? (
            <button
              type="button"
              onClick={handleToggleCollectionLike}
              className="theme-button-soft rounded-full p-2.5 text-[color:color-mix(in_srgb,var(--foreground)_75%,transparent)] transition hover:text-[color:var(--foreground)]"
              aria-label={t("collection.likeCollection")}
              title={t("collection.saveToLibrary")}
            >
              <HeartGlyph />
            </button>
          ) : null}
          {canOpenPlaylistActions ? (
            <button
              type="button"
              onClick={() => setIsPlaylistActionsOpen(true)}
              className="theme-button-soft rounded-full p-2.5 text-[color:color-mix(in_srgb,var(--foreground)_75%,transparent)] transition hover:text-[color:var(--foreground)]"
              aria-label={t("collection.moreActions")}
            >
              <MoreGlyph />
            </button>
          ) : null}
          {isRemovableLocalPlaylist ? (
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(true)}
              className="theme-button-soft inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold text-[color:color-mix(in_srgb,var(--foreground)_78%,transparent)] transition hover:text-[color:var(--foreground)]"
              aria-label={t("collection.removePlaylistAction")}
            >
              <TrashGlyph />
              {t("collection.removePlaylistAction")}
            </button>
          ) : null}
          {entries.length > 0 ? (
            <label
              className="theme-button-soft inline-flex w-full min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition focus-within:border-[color:color-mix(in_srgb,var(--foreground)_16%,transparent)] focus-within:text-[color:var(--foreground)] sm:max-w-sm"
              style={{ marginInlineStart: "auto" }}
            >
              <SearchGlyph />
              <input
                ref={collectionSearchInputRef}
                type="text"
                value={collectionQuery}
                onChange={(event) => setCollectionQuery(event.target.value)}
                placeholder={t("collection.searchInCollection")}
                className="w-full min-w-0 flex-1 bg-transparent text-sm text-[color:var(--foreground)] outline-none placeholder:text-[color:color-mix(in_srgb,var(--foreground)_35%,transparent)]"
                aria-label={t("collection.searchInCollection")}
              />
              {collectionQuery ? (
                <button
                  type="button"
                  onClick={() => setCollectionQuery("")}
                  className="rounded-full p-1 text-[color:color-mix(in_srgb,var(--foreground)_45%,transparent)] transition hover:bg-[color:color-mix(in_srgb,var(--foreground)_8%,transparent)] hover:text-[color:var(--foreground)]"
                  aria-label={t("search.clear")}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" d="m7 7 10 10M17 7 7 17" />
                  </svg>
                </button>
              ) : null}
            </label>
          ) : null}
        </div>
        <div className="mt-6" style={{ paddingInlineEnd: "0.25rem" }}>
          {remoteState.error && entries.length === 0 ? (
            <div className="theme-overlay rounded-2xl border p-5 text-[color:var(--foreground)]">
              {remoteState.error}
            </div>
          ) : entries.length > 0 && filteredEntries.length === 0 ? (
            <div className="theme-surface-soft rounded-2xl border p-5 text-[color:color-mix(in_srgb,var(--foreground)_60%,transparent)]">
              {t("collection.noSearchResults")}
            </div>
          ) : entries.length > 0 ? (
            <div>
              {kind === "playlist" ? (
                <div className="mx-3 border-b border-[color:var(--border-subtle)] pb-3" />
              ) : (
                <div className={headerGridClass}>
                  {canReorderLocalPlaylist ? <div /> : null}
                  <div className="text-center">#</div>
                  <div>{t("collection.titleColumn")}</div>
                  <div className="hidden truncate md:block">
                    {t("collection.albumColumn")}
                  </div>
                  <div className="hidden md:block">
                    {t("collection.dateAdded")}
                  </div>
                  <div className="flex justify-end">
                    <ClockGlyph />
                  </div>
                </div>
              )}

              <div className="mt-2 space-y-1">
                {filteredEntries.map((entry, index) => {
                  const rowCoverUrl = resolveEntryCoverUrl(entry);
                  const isActiveTrack = currentSong?.id === entry.id;
                  const isLoadingTrack = loadingSongId === entry.id;
                  const rowSong =
                    localCollection?.songs.find((storedSong) =>
                      matchesCollectionEntrySong(entry, storedSong)
                    ) ||
                    toSongSnapshot(entry, {
                      artist: displayAuthor,
                      source: collectionSource,
                    });
                  const isEntryLiked = likedSongKeys.has(
                    getSongPreferenceKey(rowSong.id, rowSong.source)
                  );

                  return (
                    <div
                      key={`${entry.id}-${index}`}
                      onClick={
                        canPlayEntries
                          ? () => {
                              if (suppressRowClickRef.current) {
                                suppressRowClickRef.current = false;
                                return;
                              }

                              void handleEntryPress(entry);
                            }
                          : undefined
                      }
                      onKeyDown={
                        canPlayEntries
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                void handleEntryPress(entry);
                              }
                            }
                          : undefined
                      }
                      role={canPlayEntries ? "button" : undefined}
                      tabIndex={canPlayEntries ? 0 : undefined}
                      draggable={canReorderLocalPlaylist}
                      onDragStart={
                        canReorderLocalPlaylist
                          ? (event) => {
                              setDraggedEntryIndex(index);
                              setDragOverEntryIndex(index);
                              suppressRowClickRef.current = true;
                              event.dataTransfer.effectAllowed = "move";
                            }
                          : undefined
                      }
                      onDragOver={
                        canReorderLocalPlaylist
                          ? (event) => {
                              event.preventDefault();
                              if (dragOverEntryIndex !== index) {
                                setDragOverEntryIndex(index);
                              }
                            }
                          : undefined
                      }
                      onDrop={
                        canReorderLocalPlaylist
                          ? (event) => {
                              event.preventDefault();
                              if (draggedEntryIndex != null) {
                                handleReorderEntry(draggedEntryIndex, index);
                              }
                              setDraggedEntryIndex(null);
                              setDragOverEntryIndex(null);
                            }
                          : undefined
                      }
                      onDragEnd={
                        canReorderLocalPlaylist
                          ? () => {
                              setDraggedEntryIndex(null);
                              setDragOverEntryIndex(null);
                            }
                          : undefined
                      }
                      className={`group ${rowGridClass} ${
                        canPlayEntries ? "cursor-pointer" : ""
                      } hover:bg-[color:color-mix(in_srgb,var(--surface-3)_78%,var(--foreground)_6%)] ${
                        isActiveTrack
                          ? "bg-[color:color-mix(in_srgb,var(--surface-3)_86%,var(--foreground)_4%)]"
                          : ""
                      } ${
                        dragOverEntryIndex === index &&
                        draggedEntryIndex !== index
                          ? "border border-[color:color-mix(in_srgb,var(--theme-accent)_34%,transparent)]"
                          : ""
                      }`}
                    >
                      {canReorderLocalPlaylist ? (
                        <div className="theme-muted flex items-center justify-center">
                          <DragHandleGlyph />
                        </div>
                      ) : null}
                      <div
                        className={`flex h-6 items-center justify-center text-sm ${
                          isActiveTrack
                            ? "text-[color:var(--theme-accent)]"
                            : "text-[color:color-mix(in_srgb,var(--foreground)_55%,transparent)]"
                        }`}
                      >
                        {isLoadingTrack ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[color:color-mix(in_srgb,var(--foreground)_70%,transparent)] border-t-transparent" />
                        ) : isActiveTrack && isPlaying ? (
                          <EqualizerGlyph />
                        ) : (
                          <>
                            <span className="group-hover:hidden">
                              {index + 1}
                            </span>
                            <span className="hidden text-[color:var(--foreground)] group-hover:flex">
                              <PlayGlyph className="h-3.5 w-3.5" />
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex min-w-0 items-center gap-3">
                        {rowCoverUrl ? (
                          <Image
                            src={rowCoverUrl}
                            alt=""
                            width={44}
                            height={44}
                            className="theme-surface-soft h-11 w-11 rounded object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="theme-surface-soft h-11 w-11 rounded" />
                        )}

                        <div className="min-w-0">
                          <p
                            className={`truncate text-sm font-medium ${
                              isActiveTrack
                                ? "text-[color:var(--theme-accent)]"
                                : "text-[color:var(--foreground)]"
                            }`}
                          >
                            {entry.title}
                          </p>
                          <p className="truncate text-xs text-[color:color-mix(in_srgb,var(--foreground)_60%,transparent)]">
                            {entry.artist ||
                              entry.subtitle ||
                              displayAuthor ||
                              getSourceLabel(collectionSource)}
                          </p>
                        </div>
                      </div>

                      <p className="hidden truncate text-sm text-[color:color-mix(in_srgb,var(--foreground)_60%,transparent)] md:block">
                        {entry.album || displayTitle}
                      </p>

                      <p className="hidden text-sm text-[color:color-mix(in_srgb,var(--foreground)_45%,transparent)] md:block">
                        {entry.addedAt
                          ? (() => {
                              const date = new Date(entry.addedAt);
                              return Number.isNaN(date.getTime())
                                ? entry.addedAt
                                : formatDate(date, {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  });
                            })()
                          : t("collection.recently")}
                      </p>

                      <div className="flex items-center justify-end gap-3 text-sm text-[color:color-mix(in_srgb,var(--foreground)_55%,transparent)]">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleEntryLike(entry);
                          }}
                          className={`hidden rounded-full p-1 transition group-hover:opacity-100 lg:flex ${
                            isEntryLiked
                              ? "text-[color:var(--theme-accent)] opacity-100"
                              : "text-[color:color-mix(in_srgb,var(--foreground)_60%,transparent)] opacity-0 hover:text-[color:var(--foreground)]"
                          }`}
                          aria-label={
                            isEntryLiked
                              ? t("collection.unlikeSong")
                              : t("collection.likeSong")
                          }
                        >
                          <HeartGlyph
                            filled={isEntryLiked}
                            className="h-4 w-4"
                          />
                        </button>
                        <span className="tabular-nums">
                          {formatDuration(entry.duration)}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedEntryAction({ entry, index });
                          }}
                          className="hidden rounded-full p-1 text-[color:color-mix(in_srgb,var(--foreground)_60%,transparent)] opacity-0 transition hover:text-[color:var(--foreground)] group-hover:opacity-100 lg:flex"
                          aria-label={t("collection.moreActions")}
                        >
                          <MoreGlyph />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : remoteState.isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--foreground)] border-t-transparent" />
            </div>
          ) : (
            <div className="theme-surface-soft rounded-2xl border p-5 text-[color:color-mix(in_srgb,var(--foreground)_55%,transparent)]">
              {t("collection.noMappedTracks", { kind })}
            </div>
          )}
        </div>
      </section>

      <PlaylistCreateModal
        open={isRenameModalOpen}
        name={renamePlaylistName}
        description={renamePlaylistDescription}
        onNameChange={setRenamePlaylistName}
        onDescriptionChange={setRenamePlaylistDescription}
        onClose={() => setIsRenameModalOpen(false)}
        onSubmit={handleRenamePlaylist}
        title={t("library.renamePlaylistModalTitle")}
        subtitle={t("library.renamePlaylistModalDescription")}
        submitLabel={t("collection.renamePlaylistAction")}
      />
    </div>
  );
}
