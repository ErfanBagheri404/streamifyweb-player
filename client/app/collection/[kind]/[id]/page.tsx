"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { SearchResult } from "../../../components/search";
import { useAudio } from "../../../contexts/AudioContext";

type CollectionEntry = {
  id: string;
  title: string;
  subtitle?: string;
  thumbnailUrl?: string;
  duration?: number;
  artist?: string;
  url?: string;
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
  };
  entries: CollectionEntry[];
};

function formatDuration(seconds?: number): string {
  if (!seconds || Number.isNaN(seconds)) return "";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function getCollectionEntries(item: SearchResult | null): CollectionEntry[] {
  if (!item) return [];

  if (Array.isArray(item.videos) && item.videos.length > 0) {
    return item.videos.map((video, index) => ({
      id: video.videoId || video.id || `${item.id}-${index}`,
      title: video.title || `Track ${index + 1}`,
      thumbnailUrl: video.videoThumbnails?.[0]?.url,
      duration: video.lengthSeconds,
    }));
  }

  if (Array.isArray(item.tracks) && item.tracks.length > 0) {
    return item.tracks.map((track, index) => ({
      id: String(track.id || `${item.id}-${index}`),
      title: track.title || `Track ${index + 1}`,
      subtitle: track.user?.username,
      thumbnailUrl: track.artwork_url || track.user?.avatar_url,
      duration:
        typeof track.duration === "string"
          ? Number.parseInt(track.duration, 10)
          : typeof track.duration === "number"
          ? Math.floor(track.duration / 1000)
          : undefined,
    }));
  }

  return [];
}

export default function CollectionPage() {
  const params = useParams<{ kind: string; id: string }>();
  const searchParams = useSearchParams();
  const { beginSongLoad, playSong, clearSongLoading } = useAudio();
  const [storedItem, setStoredItem] = useState<SearchResult | null>(null);
  const [remoteCollection, setRemoteCollection] = useState<CollectionPayload["collection"] | null>(null);
  const [remoteEntries, setRemoteEntries] = useState<CollectionEntry[]>([]);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [isRemoteLoading, setIsRemoteLoading] = useState(false);
  const [loadingSongId, setLoadingSongId] = useState<string | null>(null);

  const kind = params.kind === "album" ? "album" : "playlist";
  const id = decodeURIComponent(params.id);
  const source = searchParams.get("source") || "";
  const title = searchParams.get("title") || "Untitled";
  const author = searchParams.get("author") || "";
  const image = searchParams.get("image") || "";
  const href = searchParams.get("href") || "";
  const count = searchParams.get("count") || "";

  useEffect(() => {
    try {
      const savedSearch = localStorage.getItem("lastSearch");
      if (!savedSearch) return;

      const parsed = JSON.parse(savedSearch) as { results?: SearchResult[] };
      const result = parsed.results?.find(
        (entry) =>
          entry.id === id &&
          entry.type === kind &&
          (source ? entry.source === source : true)
      );

      setStoredItem(result || null);
    } catch (error) {
      console.error("Failed to restore collection details:", error);
    }
  }, [id, kind, source]);

  const isJioSaavnAlbum = source === "jiosaavn" && kind === "album";

  useEffect(() => {
    if (!isJioSaavnAlbum) {
      setRemoteCollection(null);
      setRemoteEntries([]);
      setRemoteError(null);
      setIsRemoteLoading(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setIsRemoteLoading(true);
      setRemoteError(null);

      try {
        const params = new URLSearchParams();
        params.set("id", id);
        params.set("kind", kind);
        params.set("source", source);
        const res = await fetch(`/api/collection?${params.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as Record<string, any>;
        if (!res.ok) {
          throw new Error(
            typeof json.error === "string" ? json.error : "Failed to load collection"
          );
        }
        if (!cancelled) {
          setRemoteCollection(json.collection || null);
          setRemoteEntries(Array.isArray(json.entries) ? json.entries : []);
        }
      } catch (error) {
        if (!cancelled) {
          setRemoteError(
            error instanceof Error ? error.message : "Failed to load collection"
          );
        }
      } finally {
        if (!cancelled) setIsRemoteLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [id, isJioSaavnAlbum, kind, source]);

  const entries = useMemo(
    () => (isJioSaavnAlbum ? remoteEntries : getCollectionEntries(storedItem)),
    [isJioSaavnAlbum, remoteEntries, storedItem]
  );

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

  const displayTitle = remoteCollection?.title || storedItem?.title || title;
  const displayAuthor = remoteCollection?.author || storedItem?.author || author;
  const displayImage =
    remoteCollection?.thumbnailUrl ||
    storedItem?.thumbnailUrl ||
    storedItem?.img ||
    image;
  const displayHref = remoteCollection?.url || storedItem?.href || storedItem?.url || href;
  const displayCount =
    remoteCollection?.count != null
      ? `${remoteCollection.count} ${kind === "album" && source === "jiosaavn" ? "songs" : "items"}`
      : storedItem?.videoCount != null
      ? `${storedItem.videoCount} items`
      : count
      ? `${count} items`
      : "";

  const handleJioSaavnSongPress = async (entry: CollectionEntry) => {
    if (loadingSongId === entry.id) return;

    setLoadingSongId(entry.id);
    beginSongLoad({
      id: entry.id,
      title: entry.title,
      artist: entry.artist || displayAuthor || "Unknown Artist",
      coverUrl: entry.thumbnailUrl || displayImage,
      duration: entry.duration,
      cachedAt: Date.now(),
    });

    try {
      const params = new URLSearchParams();
      params.set("id", entry.id);
      params.set("source", "jiosaavn");
      params.set("title", entry.title);
      params.set("artist", entry.artist || displayAuthor || "Unknown Artist");
      if (entry.url) params.set("url", entry.url);

      const response = await fetch(`/api/video?${params.toString()}`);
      const videoData = (await response.json()) as Record<string, unknown>;

      if (!response.ok || typeof videoData.audioUrl !== "string") {
        throw new Error("Failed to resolve audio");
      }

      playSong({
        id: entry.id,
        title: entry.title,
        artist: entry.artist || displayAuthor || "Unknown Artist",
        coverUrl: entry.thumbnailUrl || displayImage,
        audioUrl: videoData.audioUrl,
        duration:
          typeof videoData.lengthSeconds === "number"
            ? videoData.lengthSeconds
            : entry.duration,
        cachedAt: Date.now(),
      });
    } catch (error) {
      console.error("Failed to play JioSaavn track:", error);
      clearSongLoading();
    } finally {
      setLoadingSongId((current) => (current === entry.id ? null : current));
    }
  };

  return (
    <div className="min-h-screen text-white">
      <div className="rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900/40">
        <div className="relative h-56 bg-neutral-900">
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/65 to-black/20" />
          <div className="absolute left-4 top-4 z-10">
            <Link
              href={backHref}
              className="rounded-full bg-black/50 px-3 py-2 text-sm text-neutral-300 transition-colors hover:text-white"
            >
              ← Back
            </Link>
          </div>
          <div className="absolute inset-0 flex items-end gap-5 px-6 pb-6">
            {displayImage ? (
              <img
                src={displayImage}
                alt={displayTitle}
                className="h-32 w-32 rounded-2xl object-cover bg-neutral-800 shadow-xl"
              />
            ) : (
              <div className="h-32 w-32 rounded-2xl bg-neutral-800" />
            )}

            <div className="min-w-0">
              <p className="mb-2 text-xs uppercase tracking-[0.25em] text-neutral-400">
                {kind}
              </p>
              <h1 className="truncate text-3xl font-extrabold sm:text-5xl">
                {displayTitle}
              </h1>
              {displayAuthor && (
                <p className="mt-2 truncate text-neutral-300">
                  {displayAuthor}
                </p>
              )}
              {displayCount && (
                <p className="mt-1 text-sm text-neutral-500">{displayCount}</p>
              )}
              {source && (
                <p className="mt-1 text-sm capitalize text-neutral-500">
                  Source: {source}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {remoteError ? (
        <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-200">
          {remoteError}
        </div>
      ) : isRemoteLoading ? (
        <div className="mt-6 flex justify-center py-10">
          <div className="inline-block w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/30">
          {entries.map((entry, index) => (
            isJioSaavnAlbum ? (
              <button
                key={`${entry.id}-${index}`}
                type="button"
                onClick={() => handleJioSaavnSongPress(entry)}
                disabled={loadingSongId === entry.id}
                className="flex w-full items-center gap-3 border-b border-neutral-800 px-4 py-3 text-left last:border-b-0 hover:bg-white/5 disabled:opacity-60"
              >
                <div className="w-8 flex-shrink-0 text-center text-sm text-neutral-500">
                  {loadingSongId === entry.id ? "..." : index + 1}
                </div>
                {entry.thumbnailUrl ? (
                  <img
                    src={entry.thumbnailUrl}
                    alt=""
                    className="h-12 w-12 rounded-lg object-cover bg-neutral-800"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-neutral-800" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{entry.title}</div>
                  {(entry.subtitle || entry.artist) && (
                    <div className="truncate text-sm text-neutral-500">
                      {entry.subtitle || entry.artist}
                    </div>
                  )}
                </div>
                {entry.duration ? (
                  <div className="text-sm tabular-nums text-neutral-500">
                    {formatDuration(entry.duration)}
                  </div>
                ) : null}
              </button>
            ) : (
              <div
                key={`${entry.id}-${index}`}
                className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3 last:border-b-0"
              >
                <div className="w-8 flex-shrink-0 text-center text-sm text-neutral-500">
                  {index + 1}
                </div>
                {entry.thumbnailUrl ? (
                  <img
                    src={entry.thumbnailUrl}
                    alt=""
                    className="h-12 w-12 rounded-lg object-cover bg-neutral-800"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-neutral-800" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{entry.title}</div>
                  {entry.subtitle && (
                    <div className="truncate text-sm text-neutral-500">
                      {entry.subtitle}
                    </div>
                  )}
                </div>
                {entry.duration ? (
                  <div className="text-sm tabular-nums text-neutral-500">
                    {formatDuration(entry.duration)}
                  </div>
                ) : null}
              </div>
            )
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-5 text-neutral-400">
          No mapped tracks were available for this {kind} yet.
        </div>
      )}

      {displayHref ? (
        <div className="mt-5">
          <a
            href={displayHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-full bg-white px-5 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
          >
            Open Source Page
          </a>
        </div>
      ) : null}
    </div>
  );
}
