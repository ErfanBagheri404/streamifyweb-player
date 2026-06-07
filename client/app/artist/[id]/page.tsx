"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { type Song, useAudio } from "../../contexts/AudioContext";
import { useAppLanguage } from "../../hooks/useAppLanguage";
import { HorizontalScrollRow } from "../../components/HorizontalScrollRow";
import { findSavedArtistRouteContext } from "../../lib/navigation-state";
import { readSessionCache, writeSessionCache } from "../../lib/session-cache";

type ArtistPayload = {
  artist: {
    id: string;
    name: string;
    image?: string;
    banner?: string;
    subscribers?: number;
    verified?: boolean;
    description?: string;
    source?: string;
    url?: string;
  };
  songs: Array<{
    id: string;
    title: string;
    thumbnail?: string;
    views?: number;
    duration?: number;
    artist?: string;
    url?: string;
  }>;
  albums: Array<{
    id: string;
    title: string;
    thumbnail?: string;
    year?: string;
    videoCount?: number;
    songCount?: number;
    url?: string;
  }>;
  playlists: Array<{
    id: string;
    title: string;
    thumbnail?: string;
    videoCount?: number;
  }>;
};

type ArtistSong = ArtistPayload["songs"][number];

const ARTIST_PAGE_CACHE_TTL_MS = 15 * 60 * 1000;

function getArtistPageCacheKey(id: string, source: string): string {
  return `artist-page:${source || "default"}:${id}`;
}

function formatCount(value?: number): string {
  if (value == null) return "";
  if (value < 1000) return `${value}`;
  if (value < 1000000) return `${(value / 1000).toFixed(1).replace(".0", "")}K`;
  if (value < 1000000000) {
    return `${(value / 1000000).toFixed(1).replace(".0", "")}M`;
  }
  return `${(value / 1000000000).toFixed(1).replace(".0", "")}B`;
}

function formatDuration(value?: number): string {
  if (!value) return "";
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function PlayGlyph({ className = "h-5 w-5" }: { className?: string }) {
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

function LoadingDotsGlyph() {
  return (
    <span
      className="inline-flex items-center justify-center gap-1"
      aria-hidden="true"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      <span
        className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"
        style={{ animationDelay: "120ms" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"
        style={{ animationDelay: "240ms" }}
      />
    </span>
  );
}

export default function ArtistPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { resolveAndPlaySong } = useAudio();
  const { t } = useAppLanguage();

  const id = params.id;
  const savedRouteContext = useMemo(
    () => findSavedArtistRouteContext(id),
    [id]
  );
  const initialName = savedRouteContext?.name || "";
  const initialImage = savedRouteContext?.image || "";
  const sourceParam =
    searchParams.get("source") ||
    savedRouteContext?.source ||
    (searchParams.get("search_source") === "jiosaavn" ? "jiosaavn" : "");
  const artistCacheKey = useMemo(
    () => getArtistPageCacheKey(id, sourceParam),
    [id, sourceParam]
  );
  const cachedArtistData = useMemo(
    () =>
      readSessionCache<ArtistPayload>(artistCacheKey, ARTIST_PAGE_CACHE_TTL_MS),
    [artistCacheKey]
  );

  const [artistState, setArtistState] = useState<{
    cacheKey: string;
    data: ArtistPayload | null;
    isLoading: boolean;
    error: string | null;
  }>({
    cacheKey: artistCacheKey,
    data: cachedArtistData,
    isLoading: !cachedArtistData,
    error: null,
  });
  const [loadingSongId, setLoadingSongId] = useState<string | null>(null);
  const activeState =
    artistState.cacheKey === artistCacheKey
      ? artistState
      : {
          cacheKey: artistCacheKey,
          data: cachedArtistData,
          isLoading: !cachedArtistData,
          error: null,
        };
  const data = activeState.data;
  const isLoading = activeState.isLoading;
  const error = activeState.error;
  const songs = useMemo(() => data?.songs ?? [], [data?.songs]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const nextParams = new URLSearchParams({ id });
        if (sourceParam) nextParams.set("source", sourceParam);
        const res = await fetch(`/api/artist?${nextParams.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as unknown;
        if (!res.ok) {
          const errorPayload =
            json && typeof json === "object"
              ? (json as { error?: unknown })
              : undefined;
          const msg =
            typeof errorPayload?.error === "string"
              ? errorPayload.error
              : "Failed to load artist";
          throw new Error(msg);
        }
        if (!cancelled) {
          const payload = json as ArtistPayload;
          setArtistState({
            cacheKey: artistCacheKey,
            data: payload,
            isLoading: false,
            error: null,
          });
          writeSessionCache(artistCacheKey, payload);
        }
      } catch (e) {
        if (!cancelled) {
          setArtistState({
            cacheKey: artistCacheKey,
            data: cachedArtistData,
            isLoading: false,
            error: (e as Error).message || "Failed to load artist",
          });
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [artistCacheKey, cachedArtistData, id, sourceParam]);

  const header = useMemo(() => {
    const name = data?.artist.name || initialName || "Artist";
    const image = data?.artist.image || initialImage || "";
    const banner = data?.artist.banner || "";
    const subscribers = data?.artist.subscribers;
    const verified = Boolean(data?.artist.verified);
    const description = data?.artist.description || "";
    return { name, image, banner, subscribers, verified, description };
  }, [data, initialImage, initialName]);

  const pageSource = data?.artist.source || sourceParam || "youtube";
  const isJioSaavnArtist = pageSource === "jiosaavn";

  const featuredSong = useMemo(() => {
    if (!songs.length) return null;
    return songs.reduce((best, song) => {
      const bestViews = best.views ?? 0;
      const songViews = song.views ?? 0;
      return songViews > bestViews ? song : best;
    }, songs[0]);
  }, [songs]);

  const playbackQueue = useMemo<Song[]>(
    () =>
      songs.map((song) => ({
        id: song.id,
        title: song.title,
        artist: song.artist || header.name || "Unknown Artist",
        coverUrl: song.thumbnail || header.image,
        duration: song.duration,
        source: pageSource,
        url: song.url,
      })),
    [header.image, header.name, pageSource, songs]
  );

  const backParams = new URLSearchParams();
  const searchQuery = searchParams.get("search_query");
  const searchSource = searchParams.get("search_source");
  const searchFilter = searchParams.get("search_filter");
  if (searchQuery) backParams.set("q", searchQuery);
  if (searchSource) backParams.set("source", searchSource);
  if (searchFilter) backParams.set("filter", searchFilter);
  const backHref = backParams.toString()
    ? `/search?${backParams.toString()}`
    : null;

  const buildAlbumHref = (album: ArtistPayload["albums"][number]) => {
    const nextParams = new URLSearchParams();
    nextParams.set("source", "jiosaavn");
    if (searchParams.get("search_query")) {
      nextParams.set("search_query", searchParams.get("search_query") || "");
    }
    if (searchParams.get("search_source")) {
      nextParams.set("search_source", searchParams.get("search_source") || "");
    }
    if (searchParams.get("search_filter")) {
      nextParams.set("search_filter", searchParams.get("search_filter") || "");
    }
    return `/collection/album/${encodeURIComponent(
      album.id
    )}?${nextParams.toString()}`;
  };

  const buildPlaylistHref = (playlist: ArtistPayload["playlists"][number]) => {
    const nextParams = new URLSearchParams();
    nextParams.set("source", pageSource || "youtube");
    if (searchParams.get("search_query")) {
      nextParams.set("search_query", searchParams.get("search_query") || "");
    }
    if (searchParams.get("search_source")) {
      nextParams.set("search_source", searchParams.get("search_source") || "");
    }
    if (searchParams.get("search_filter")) {
      nextParams.set("search_filter", searchParams.get("search_filter") || "");
    }
    return `/collection/playlist/${encodeURIComponent(
      playlist.id
    )}?${nextParams.toString()}`;
  };

  const handleSongPress = async (song: ArtistSong) => {
    if (loadingSongId === song.id) return;

    setLoadingSongId(song.id);
    try {
      const currentIndex = playbackQueue.findIndex(
        (entry) => entry.id === song.id
      );
      await resolveAndPlaySong(
        {
          id: song.id,
          title: song.title,
          artist: song.artist || header.name || "Unknown Artist",
          coverUrl: song.thumbnail || header.image,
          duration: song.duration,
          source: pageSource,
          url: song.url,
        },
        {
          queue: playbackQueue,
          currentIndex: currentIndex >= 0 ? currentIndex : 0,
        }
      );
    } catch (e) {
      console.error("Failed to play artist song:", e);
    } finally {
      setLoadingSongId((current) => (current === song.id ? null : current));
    }
  };

  return (
    <div className="min-h-full text-white">
      <div className="theme-surface-strong relative overflow-hidden rounded-xl border">
        <button
          type="button"
          onClick={() => {
            if (backHref) {
              router.push(backHref);
              return;
            }
            router.back();
          }}
          className="theme-overlay absolute left-3 top-3 z-20 rounded-full border px-3 py-2 text-xs text-white/78 transition-colors hover:text-white sm:left-4 sm:top-4 sm:text-sm"
        >
          {`← ${t("common.back")}`}
        </button>

        <div
          className="relative min-h-[220px] bg-neutral-800 sm:min-h-[360px]"
          style={{
            backgroundImage: header.banner
              ? `url(${header.banner})`
              : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-black/45 to-black/10" />
          <div className="absolute inset-x-0 bottom-0 p-3 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
              {header.image ? (
                <img
                  src={header.image}
                  alt={header.name}
                  className="theme-surface h-20 w-20 rounded-full border object-cover shadow-[0_20px_45px_rgba(0,0,0,0.28)] sm:h-36 sm:w-36"
                />
              ) : (
                <div className="theme-surface h-20 w-20 rounded-full border sm:h-36 sm:w-36" />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {header.verified ? (
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/14 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
                      {t("artist.verified")}
                    </span>
                  ) : null}
                  {pageSource ? (
                    <span className="rounded-full border border-white/12 bg-black/25 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/72">
                      {pageSource}
                    </span>
                  ) : null}
                </div>

                <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:mt-3 sm:text-6xl">
                  {header.name}
                </h1>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/72 sm:gap-3 sm:text-sm">
                  {header.subscribers != null && header.subscribers > 0 ? (
                    <span className="rounded-full border border-white/12 bg-black/20 px-3 py-1.5">
                      {t("artist.subscribers", {
                        count: formatCount(header.subscribers),
                      })}
                    </span>
                  ) : null}
                  {data?.songs.length ? (
                    <span className="rounded-full border border-white/12 bg-black/20 px-3 py-1.5">
                      {t("artist.songCount", { count: data.songs.length })}
                    </span>
                  ) : null}
                  {data?.playlists.length ? (
                    <span className="rounded-full border border-white/12 bg-black/20 px-3 py-1.5">
                      {data.playlists.length} {t("artist.playlists")}
                    </span>
                  ) : null}
                </div>

                {header.description ? (
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-white/62 sm:mt-4 sm:text-base">
                    {header.description}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {!data && isLoading ? (
          <div className="flex justify-center py-10">
            <div className="theme-spinner h-7 w-7" />
          </div>
        ) : null}

        {!data && !isLoading && error ? (
          <div className="mx-6 my-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            {error}
          </div>
        ) : null}

        {data ? (
          <div className="relative z-10 -mt-5 px-2 pb-8 sm:-mt-6 sm:px-6">
            <div className="theme-surface overflow-hidden rounded-xl border border-white/8 shadow-[0_24px_90px_rgba(0,0,0,0.22)]">
              {data.songs.length > 0 ? (
                <div className="border-b border-white/8 px-3 py-4 sm:px-6 sm:py-6">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-bold text-white">
                        {t("artist.popularTracks")}
                      </h2>
                    </div>
                    {featuredSong ? (
                      <button
                        type="button"
                        onClick={() => void handleSongPress(featuredSong)}
                        disabled={loadingSongId === featuredSong.id}
                        className="theme-button-accent inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-[0_16px_40px_rgba(0,0,0,0.24)] transition hover:scale-[1.02] disabled:cursor-wait disabled:opacity-70 sm:w-auto"
                      >
                        <PlayGlyph className="h-4 w-4" />
                        {t("common.play")}
                      </button>
                    ) : null}
                  </div>

                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
                    <div className="flex flex-col gap-2.5">
                      {data.songs.slice(0, 20).map((song, idx) => (
                        <button
                          key={`${song.id}-${idx}`}
                          type="button"
                          onClick={() => void handleSongPress(song)}
                          disabled={loadingSongId === song.id}
                          className="group theme-surface-soft grid w-full grid-cols-[24px_40px_minmax(0,1fr)_44px] items-center gap-2 rounded-lg border border-white/8 px-2.5 py-2.5 text-left transition hover:border-white/12 hover:bg-white/[0.05] disabled:cursor-wait disabled:opacity-60 sm:grid-cols-[42px_52px_minmax(0,1fr)_64px] sm:gap-3 sm:px-3 sm:py-3 md:grid-cols-[42px_52px_minmax(0,1fr)_120px_64px]"
                        >
                          <div className="relative flex h-8 w-8 items-center justify-center text-xs tabular-nums text-white/35 sm:h-10 sm:w-10 sm:text-sm">
                            <span
                              className={[
                                "transition-opacity",
                                loadingSongId === song.id
                                  ? "opacity-100"
                                  : "group-hover:opacity-0",
                              ].join(" ")}
                            >
                              {loadingSongId === song.id ? (
                                <LoadingDotsGlyph />
                              ) : (
                                idx + 1
                              )}
                            </span>
                            {loadingSongId !== song.id ? (
                              <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                                <PlayGlyph className="h-4 w-4 text-white" />
                              </span>
                            ) : null}
                          </div>

                          {song.thumbnail ? (
                            <img
                              src={song.thumbnail}
                              alt=""
                              className="theme-surface h-10 w-10 flex-shrink-0 rounded-lg border object-cover sm:h-12 sm:w-12 sm:rounded-xl"
                            />
                          ) : (
                            <div className="theme-surface h-10 w-10 flex-shrink-0 rounded-lg border sm:h-12 sm:w-12 sm:rounded-xl" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-white sm:text-base">
                              {song.title}
                            </div>
                            <div className="truncate text-xs text-white/45 sm:text-sm">
                              {song.artist || header.name}
                            </div>
                          </div>

                          <div className="hidden text-right text-sm tabular-nums text-white/42 md:block">
                            {song.views != null && song.views > 0
                              ? t("artist.views", {
                                  count: formatCount(song.views),
                                })
                              : ""}
                          </div>

                          <div className="text-right text-xs tabular-nums text-white/42 sm:text-sm">
                            {formatDuration(song.duration)}
                          </div>
                        </button>
                      ))}
                    </div>

                    {featuredSong ? (
                      <div className="theme-surface-soft flex flex-col self-start overflow-hidden rounded-xl border border-white/8 p-4">
                        <div className="relative h-[220px] overflow-hidden rounded-lg">
                          {featuredSong.thumbnail ? (
                            <img
                              src={featuredSong.thumbnail}
                              alt={featuredSong.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="theme-surface w-full rounded-lg border" />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                          <div className="absolute inset-x-0 bottom-0 p-4">
                            <div className="inline-flex rounded-full border border-white/12 bg-black/35 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/72">
                              {t("artist.mostPlayed")}
                            </div>
                            <h3 className="mt-3 line-clamp-2 text-2xl font-black tracking-tight text-white">
                              {featuredSong.title}
                            </h3>
                            <p className="mt-1 text-sm text-white/62">
                              {featuredSong.artist || header.name}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/68">
                          {featuredSong.views != null &&
                          featuredSong.views > 0 ? (
                            <span className="rounded-full border border-white/10 bg-black/18 px-3 py-1.5">
                              {t("artist.views", {
                                count: formatCount(featuredSong.views),
                              })}
                            </span>
                          ) : null}
                          {featuredSong.duration ? (
                            <span className="rounded-full border border-white/10 bg-black/18 px-3 py-1.5">
                              {formatDuration(featuredSong.duration)}
                            </span>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleSongPress(featuredSong)}
                          disabled={loadingSongId === featuredSong.id}
                          className="theme-button-accent mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition hover:scale-[1.01] disabled:cursor-wait disabled:opacity-70"
                        >
                          <PlayGlyph className="h-4 w-4" />
                          {t("common.play")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="px-6 py-6 text-white/45">
                  {t("artist.noSongs")}
                </div>
              )}

              {data.albums.length > 0 ? (
                <div className="border-b border-white/8 px-3 py-4 sm:px-6 sm:py-6">
                  <h2 className="mb-4 text-2xl font-bold">
                    {t("artist.albums")}
                  </h2>
                  <HorizontalScrollRow
                    containerClassName="px-4 pb-2 sm:px-12"
                    contentClassName="flex w-max gap-4"
                  >
                    {data.albums.map((album, idx) =>
                      isJioSaavnArtist ? (
                        <Link
                          key={`${album.id}-${idx}`}
                          href={buildAlbumHref(album)}
                          className="group theme-surface relative min-w-[180px] max-w-[180px] rounded-xl border border-white/8 p-3 transition hover:-translate-y-1 hover:bg-white/[0.06]"
                        >
                          <div className="relative overflow-hidden rounded-xl">
                            {album.thumbnail ? (
                              <img
                                src={album.thumbnail}
                                alt={album.title}
                                className="theme-surface aspect-square w-full border object-cover transition duration-300 group-hover:scale-[1.03]"
                              />
                            ) : (
                              <div className="theme-surface aspect-square w-full rounded-lg border" />
                            )}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/78 to-transparent p-3">
                              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-lg">
                                <PlayGlyph className="ml-0.5 h-4 w-4" />
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 truncate font-semibold text-white">
                            {album.title}
                          </div>
                          <div className="mt-1 text-sm text-white/45">
                            {album.year ||
                              (album.songCount
                                ? t("artist.songCount", {
                                    count: album.songCount,
                                  })
                                : album.videoCount
                                ? t("artist.videoCount", {
                                    count: album.videoCount,
                                  })
                                : "")}
                          </div>
                        </Link>
                      ) : (
                        <a
                          key={`${album.id}-${idx}`}
                          href={
                            album.id.startsWith("http") ? album.id : undefined
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="group theme-surface relative min-w-[180px] max-w-[180px] rounded-[22px] border border-white/8 p-3 transition hover:-translate-y-1 hover:bg-white/[0.06]"
                        >
                          <div className="relative overflow-hidden rounded-[18px]">
                            {album.thumbnail ? (
                              <img
                                src={album.thumbnail}
                                alt={album.title}
                                className="theme-surface aspect-square w-full border object-cover transition duration-300 group-hover:scale-[1.03]"
                              />
                            ) : (
                              <div className="theme-surface aspect-square w-full rounded-[18px] border" />
                            )}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/78 to-transparent p-3">
                              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-lg">
                                <PlayGlyph className="ml-0.5 h-4 w-4" />
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 truncate font-semibold text-white">
                            {album.title}
                          </div>
                          <div className="mt-1 text-sm text-white/45">
                            {album.year ||
                              (album.songCount
                                ? t("artist.songCount", {
                                    count: album.songCount,
                                  })
                                : album.videoCount
                                ? t("artist.videoCount", {
                                    count: album.videoCount,
                                  })
                                : "")}
                          </div>
                        </a>
                      )
                    )}
                  </HorizontalScrollRow>
                </div>
              ) : null}

              {data.playlists.length > 0 ? (
                <div className="px-3 py-4 sm:px-6 sm:py-6">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-2xl font-bold">
                      {t("artist.playlists")}
                    </h2>
                    <span className="text-sm text-white/45">
                      {data.playlists.length} {t("artist.playlists")}
                    </span>
                  </div>

                  <HorizontalScrollRow
                    containerClassName="pb-2"
                    contentClassName="flex w-max gap-5"
                  >
                    {data.playlists.map((playlist, idx) => (
                      <Link
                        key={`${playlist.id}-${idx}`}
                        href={buildPlaylistHref(playlist)}
                        className="group relative min-w-[220px] max-w-[220px] overflow-hidden rounded-xl border border-white/8 bg-[#121212] transition hover:-translate-y-1 hover:border-white/14"
                      >
                        <div className="relative aspect-square overflow-hidden">
                          {playlist.thumbnail ? (
                            <img
                              src={playlist.thumbnail}
                              alt={playlist.title}
                              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                            />
                          ) : (
                            <div className="theme-surface h-full w-full" />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                          <div className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-[0_14px_24px_rgba(0,0,0,0.26)] opacity-0 transition duration-200 group-hover:opacity-100">
                            <PlayGlyph className="ml-0.5 h-4 w-4" />
                          </div>
                          <div className="absolute inset-x-0 bottom-0 p-4">
                            <div className="inline-flex rounded-full border border-white/12 bg-black/38 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/72">
                              {t("artist.playlists")}
                            </div>
                            <div className="mt-3 line-clamp-2 text-lg font-bold text-white">
                              {playlist.title}
                            </div>
                            <div className="mt-2 text-sm text-white/55">
                              {playlist.videoCount != null &&
                              playlist.videoCount > 0
                                ? t("artist.videoCount", {
                                    count: playlist.videoCount,
                                  })
                                : t("common.open")}
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </HorizontalScrollRow>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
