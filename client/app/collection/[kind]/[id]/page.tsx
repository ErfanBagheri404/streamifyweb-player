"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { SearchResult } from "../../../components/search";
import { useAudio } from "../../../contexts/AudioContext";

const DEBUG_SERVER_URL = "";
const DEBUG_SESSION_ID = "soundcloud-collection-bug";

function reportDebugEvent(
  runId: string,
  hypothesisId: string,
  location: string,
  msg: string,
  data: Record<string, unknown>
) {
  if (!DEBUG_SERVER_URL) return;
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
}

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

function getSourceLabel(source?: string): string {
  switch ((source || "").toLowerCase()) {
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

function HeartGlyph() {
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
        d="M12 20.25s-7.5-4.35-7.5-10.125A4.125 4.125 0 0 1 8.625 6a4.68 4.68 0 0 1 3.375 1.575A4.68 4.68 0 0 1 15.375 6 4.125 4.125 0 0 1 19.5 10.125C19.5 15.9 12 20.25 12 20.25Z"
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

function EqualizerGlyph() {
  return (
    <div className="flex h-4 items-end gap-[2px]" aria-hidden="true">
      <span className="h-2 w-[3px] animate-pulse rounded-full bg-[#1ed760]" />
      <span className="h-4 w-[3px] animate-pulse rounded-full bg-[#1ed760] [animation-delay:120ms]" />
      <span className="h-3 w-[3px] animate-pulse rounded-full bg-[#1ed760] [animation-delay:240ms]" />
    </div>
  );
}

function getCollectionEntries(item: SearchResult | null): CollectionEntry[] {
  if (!item) return [];

  if (Array.isArray(item.videos) && item.videos.length > 0) {
    return item.videos.map((video, index) => ({
      id: video.videoId || video.id || `${item.id}-${index}`,
      title: video.title || `Track ${index + 1}`,
      thumbnailUrl: video.videoThumbnails?.[0]?.url,
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

export default function CollectionPage() {
  const params = useParams<{ kind: string; id: string }>();
  const searchParams = useSearchParams();
  const { currentSong, isPlaying, resolveAndPlaySong } = useAudio();

  const kind = params.kind === "album" ? "album" : "playlist";
  const id = decodeURIComponent(params.id);
  const source = searchParams.get("source") || "";
  const title = searchParams.get("title") || "Untitled";
  const author = searchParams.get("author") || "";
  const image = searchParams.get("image") || "";
  const href = searchParams.get("href") || "";
  const count = searchParams.get("count") || "";
  const runId = useMemo(() => `pre-${Date.now()}`, []);

  const storedItem = useMemo(
    () => readStoredCollectionItem(id, kind, source),
    [id, kind, source]
  );

  const [remoteState, setRemoteState] = useState<{
    collection: CollectionPayload["collection"] | null;
    entries: CollectionEntry[];
    error: string | null;
    isLoading: boolean;
  }>({
    collection: null,
    entries: [],
    error: null,
    isLoading: false,
  });
  const [loadingSongId, setLoadingSongId] = useState<string | null>(null);

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

      setRemoteState((previous) => ({
        ...previous,
        error: null,
        isLoading: true,
      }));

      try {
        const params = new URLSearchParams();
        params.set("id", id);
        params.set("kind", kind);
        params.set("source", source);
        if (href || storedItem?.href || storedItem?.url) {
          params.set("url", href || storedItem?.href || storedItem?.url || "");
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
            href,
            storedHref: storedItem?.href || null,
            storedUrl: storedItem?.url || null,
            requestParams: params.toString(),
          }
        );
        // #endregion

        const response = await fetch(`/api/collection?${params.toString()}`, {
          cache: "no-store",
        });
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
          setRemoteState({
            collection:
              (json.collection as CollectionPayload["collection"]) || null,
            entries: Array.isArray(json.entries)
              ? (json.entries as CollectionEntry[])
              : [],
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
    href,
    id,
    kind,
    shouldFetchRemote,
    source,
    storedItem?.href,
    storedItem?.url,
  ]);

  const entries = useMemo(() => {
    if (remoteState.entries.length > 0) return remoteState.entries;
    return getCollectionEntries(storedItem);
  }, [remoteState.entries, storedItem]);

  const backParams = new URLSearchParams();
  const searchQuery = searchParams.get("search_query");
  const searchSource = searchParams.get("search_source");
  const searchFilter = searchParams.get("search_filter");
  if (searchQuery) backParams.set("q", searchQuery);
  if (searchSource) backParams.set("source", searchSource);
  if (searchFilter) backParams.set("filter", searchFilter);
  const backHref = `/search${
    backParams.toString() ? `?${backParams.toString()}` : ""
  }`;

  const displayTitle =
    remoteState.collection?.title || storedItem?.title || title || "Untitled";
  const displayAuthor =
    remoteState.collection?.author || storedItem?.author || author;
  const displayDescription =
    remoteState.collection?.description ||
    (storedItem as (SearchResult & { description?: string }) | null)
      ?.description ||
    "";
  const displayImage =
    remoteState.collection?.thumbnailUrl ||
    storedItem?.thumbnailUrl ||
    storedItem?.img ||
    image;
  const collectionSource =
    remoteState.collection?.source || storedItem?.source || source;

  const totalRuntime = useMemo(
    () =>
      entries.reduce(
        (total, entry) =>
          total + (typeof entry.duration === "number" ? entry.duration : 0),
        0
      ),
    [entries]
  );

  const displayCountText =
    entries.length > 0
      ? `${formatCount(entries.length)} ${
          entries.length === 1 ? "song" : "songs"
        }`
      : remoteState.collection?.count != null
      ? `${formatCount(remoteState.collection.count)} items`
      : count
      ? `${count} items`
      : "";

  const metaParts = [
    getSourceLabel(collectionSource),
    displayCountText,
    formatCollectionRuntime(totalRuntime),
  ].filter(Boolean);

  const canPlayEntries = isPlayableSource(collectionSource);

  const handleEntryPress = async (entry: CollectionEntry) => {
    if (!canPlayEntries || loadingSongId === entry.id) return;

    setLoadingSongId(entry.id);

    try {
      const queue = entries.map((item) => ({
        id: item.id,
        title: item.title,
        artist:
          item.artist || item.subtitle || displayAuthor || "Unknown Artist",
        coverUrl: item.thumbnailUrl || displayImage,
        duration: item.duration,
        source: collectionSource,
        url: item.url,
      }));

      const currentIndex = queue.findIndex((song) => song.id === entry.id);

      await resolveAndPlaySong(
        {
          id: entry.id,
          title: entry.title,
          artist:
            entry.artist || entry.subtitle || displayAuthor || "Unknown Artist",
          coverUrl: entry.thumbnailUrl || displayImage,
          duration: entry.duration,
          source: collectionSource,
          url: entry.url,
        },
        {
          queue,
          currentIndex: currentIndex >= 0 ? currentIndex : 0,
        }
      );
    } catch (error) {
      console.error("Failed to play collection entry:", error);
    } finally {
      setLoadingSongId((current) => (current === entry.id ? null : current));
    }
  };

  const handlePrimaryPlay = () => {
    if (!entries[0]) return;
    void handleEntryPress(entries[0]);
  };

  return (
    <div className="min-h-full overflow-hidden rounded-2xl bg-[#121212] text-white">
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#9fadab_0%,#5d6b69_42%,#1e2726_70%,#121212_100%)] px-5 pb-8 pt-5 md:px-8 md:pb-10 md:pt-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_32%),linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.22)_55%,rgba(0,0,0,0.6)_100%)]" />
        <div className="relative z-10">
          <Link
            href={backHref}
            className="inline-flex rounded-full bg-black/25 px-3 py-2 text-sm text-white/82 backdrop-blur-sm transition hover:bg-black/35"
          >
            Back
          </Link>

          <div className="mt-7 flex flex-col items-start gap-6 md:flex-row md:items-end">
            {displayImage ? (
              <Image
                src={displayImage}
                alt={displayTitle}
                width={224}
                height={224}
                className="h-44 w-44 rounded-md bg-black/20 object-cover shadow-[0_24px_60px_rgba(0,0,0,0.4)] md:h-56 md:w-56"
                unoptimized
              />
            ) : (
              <div className="h-44 w-44 rounded-md bg-black/20 shadow-[0_24px_60px_rgba(0,0,0,0.4)] md:h-56 md:w-56" />
            )}

            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
                {kind}
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
                {displayTitle}
              </h1>
              {displayDescription ? (
                <p className="mt-4 max-w-3xl text-sm text-white/75 md:text-base">
                  {displayDescription}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/85 md:text-base">
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

      <section className="px-5 pb-10 pt-6 md:px-8">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handlePrimaryPlay}
            disabled={!entries[0] || !canPlayEntries}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1ed760] text-black transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            aria-label="Play collection"
          >
            <PlayGlyph className="h-6 w-6" />
          </button>
          <button
            type="button"
            className="rounded-full p-2.5 text-white/75 transition hover:bg-white/8 hover:text-white"
            aria-label="Like collection"
          >
            <HeartGlyph />
          </button>
          <button
            type="button"
            className="rounded-full p-2.5 text-white/75 transition hover:bg-white/8 hover:text-white"
            aria-label="More actions"
          >
            <MoreGlyph />
          </button>
        </div>

        {remoteState.error ? (
          <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-200">
            {remoteState.error}
          </div>
        ) : remoteState.isLoading ? (
          <div className="mt-8 flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </div>
        ) : entries.length > 0 ? (
          <div className="mt-8">
            <div className="grid grid-cols-[42px_minmax(0,1fr)_64px] gap-3 border-b border-white/10 px-3 pb-3 text-[11px] uppercase tracking-[0.18em] text-white/45 md:grid-cols-[42px_minmax(0,1.7fr)_minmax(0,1.05fr)_120px_64px]">
              <div className="text-center">#</div>
              <div>Title</div>
              <div className="hidden truncate md:block">Album</div>
              <div className="hidden md:block">Date Added</div>
              <div className="flex justify-end">
                <ClockGlyph />
              </div>
            </div>

            <div className="mt-2 space-y-1">
              {entries.map((entry, index) => {
                const isActiveTrack = currentSong?.id === entry.id;
                const isLoadingTrack = loadingSongId === entry.id;
                const RowComponent = canPlayEntries ? "button" : "div";

                return (
                  <RowComponent
                    key={`${entry.id}-${index}`}
                    type={canPlayEntries ? "button" : undefined}
                    onClick={
                      canPlayEntries
                        ? () => void handleEntryPress(entry)
                        : undefined
                    }
                    className={`group grid w-full grid-cols-[42px_minmax(0,1fr)_64px] items-center gap-3 rounded-md px-3 py-2.5 text-left transition hover:bg-white/10 md:grid-cols-[42px_minmax(0,1.7fr)_minmax(0,1.05fr)_120px_64px] ${
                      isActiveTrack ? "bg-white/8" : ""
                    }`}
                  >
                    <div
                      className={`flex h-6 items-center justify-center text-sm ${
                        isActiveTrack ? "text-[#1ed760]" : "text-white/55"
                      }`}
                    >
                      {isLoadingTrack ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                      ) : isActiveTrack && isPlaying ? (
                        <EqualizerGlyph />
                      ) : (
                        <>
                          <span className="group-hover:hidden">
                            {index + 1}
                          </span>
                          <span className="hidden text-white group-hover:flex">
                            <PlayGlyph className="h-3.5 w-3.5" />
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex min-w-0 items-center gap-3">
                      {entry.thumbnailUrl || displayImage ? (
                        <Image
                          src={entry.thumbnailUrl || displayImage}
                          alt=""
                          width={44}
                          height={44}
                          className="h-11 w-11 rounded object-cover bg-white/10"
                          unoptimized
                        />
                      ) : (
                        <div className="h-11 w-11 rounded bg-white/10" />
                      )}

                      <div className="min-w-0">
                        <p
                          className={`truncate text-sm font-medium ${
                            isActiveTrack ? "text-[#1ed760]" : "text-white"
                          }`}
                        >
                          {entry.title}
                        </p>
                        <p className="truncate text-xs text-white/60">
                          {entry.artist ||
                            entry.subtitle ||
                            displayAuthor ||
                            getSourceLabel(collectionSource)}
                        </p>
                      </div>
                    </div>

                    <p className="hidden truncate text-sm text-white/60 md:block">
                      {entry.album || displayTitle}
                    </p>

                    <p className="hidden text-sm text-white/45 md:block">
                      {formatDateAdded(entry.addedAt)}
                    </p>

                    <div className="flex items-center justify-end gap-3 text-sm text-white/55">
                      <span className="hidden text-white/60 opacity-0 transition group-hover:opacity-100 lg:flex">
                        <HeartGlyph />
                      </span>
                      <span className="tabular-nums">
                        {formatDuration(entry.duration)}
                      </span>
                      <span className="hidden text-white/60 opacity-0 transition group-hover:opacity-100 lg:flex">
                        <MoreGlyph />
                      </span>
                    </div>
                  </RowComponent>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white/55">
            No mapped tracks were available for this {kind} yet.
          </div>
        )}
      </section>
    </div>
  );
}
