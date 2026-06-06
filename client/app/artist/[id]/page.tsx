"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAudio } from "../../contexts/AudioContext";
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

const ARTIST_PAGE_CACHE_TTL_MS = 15 * 60 * 1000;

function getArtistPageCacheKey(id: string, source: string): string {
  return `artist-page:${source || "default"}:${id}`;
}

function formatCount(value?: number): string {
  if (value == null) return "";
  if (value < 1000) return `${value}`;
  if (value < 1000000) return `${(value / 1000).toFixed(1).replace(".0", "")}K`;
  if (value < 1000000000)
    return `${(value / 1000000).toFixed(1).replace(".0", "")}M`;
  return `${(value / 1000000000).toFixed(1).replace(".0", "")}B`;
}

function formatDuration(value?: number): string {
  if (!value) return "";
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export default function ArtistPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { beginSongLoad, playSong, clearSongLoading } = useAudio();
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

  const [data, setData] = useState<ArtistPayload | null>(cachedArtistData);
  const [isLoading, setIsLoading] = useState(!cachedArtistData);
  const [error, setError] = useState<string | null>(null);
  const [loadingSongId, setLoadingSongId] = useState<string | null>(null);

  useEffect(() => {
    setData(cachedArtistData);
    setIsLoading(!cachedArtistData);
    setError(null);
  }, [artistCacheKey, cachedArtistData]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsLoading(!cachedArtistData);
      setError(null);
      try {
        const params = new URLSearchParams({ id });
        if (sourceParam) params.set("source", sourceParam);
        const res = await fetch(`/api/artist?${params.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as unknown;
        if (!res.ok) {
          const msg =
            typeof (json as any)?.error === "string"
              ? (json as any).error
              : "Failed to load artist";
          throw new Error(msg);
        }
        if (!cancelled) {
          const payload = json as ArtistPayload;
          setData(payload);
          writeSessionCache(artistCacheKey, payload);
        }
      } catch (e) {
        if (!cancelled)
          setError((e as Error).message || "Failed to load artist");
      } finally {
        if (!cancelled) setIsLoading(false);
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
  }, [data, initialName, initialImage]);

  const pageSource = data?.artist.source || sourceParam;
  const isJioSaavnArtist = pageSource === "jiosaavn";
  const featuredSong = useMemo(() => {
    if (!data?.songs?.length) return null;

    return data.songs.reduce((best, song) => {
      const bestViews = best.views ?? 0;
      const songViews = song.views ?? 0;
      return songViews > bestViews ? song : best;
    }, data.songs[0]);
  }, [data?.songs]);
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
    const params = new URLSearchParams();
    params.set("source", "jiosaavn");
    if (searchParams.get("search_query"))
      params.set("search_query", searchParams.get("search_query") || "");
    if (searchParams.get("search_source"))
      params.set("search_source", searchParams.get("search_source") || "");
    if (searchParams.get("search_filter"))
      params.set("search_filter", searchParams.get("search_filter") || "");
    return `/collection/album/${encodeURIComponent(
      album.id
    )}?${params.toString()}`;
  };

  const buildPlaylistHref = (playlist: ArtistPayload["playlists"][number]) => {
    const params = new URLSearchParams();
    params.set("source", pageSource || "youtube");
    if (searchParams.get("search_query")) {
      params.set("search_query", searchParams.get("search_query") || "");
    }
    if (searchParams.get("search_source")) {
      params.set("search_source", searchParams.get("search_source") || "");
    }
    if (searchParams.get("search_filter")) {
      params.set("search_filter", searchParams.get("search_filter") || "");
    }
    return `/collection/playlist/${encodeURIComponent(
      playlist.id
    )}?${params.toString()}`;
  };

  const handleJioSaavnSongPress = async (
    song: ArtistPayload["songs"][number]
  ) => {
    if (loadingSongId === song.id) return;

    setLoadingSongId(song.id);
    beginSongLoad({
      id: song.id,
      title: song.title,
      artist: song.artist || header.name || "Unknown Artist",
      coverUrl: song.thumbnail,
      duration: song.duration,
      cachedAt: Date.now(),
    });

    try {
      const params = new URLSearchParams();
      params.set("id", song.id);
      params.set("source", "jiosaavn");
      params.set("title", song.title);
      params.set("artist", song.artist || header.name || "Unknown Artist");
      if (song.url) params.set("url", song.url);

      const response = await fetch(`/api/video?${params.toString()}`);
      const videoData = (await response.json()) as Record<string, unknown>;

      if (!response.ok || typeof videoData.audioUrl !== "string") {
        throw new Error("Failed to resolve audio");
      }

      playSong({
        id: song.id,
        title: song.title,
        artist: song.artist || header.name || "Unknown Artist",
        coverUrl: song.thumbnail,
        audioUrl: videoData.audioUrl,
        duration:
          typeof videoData.lengthSeconds === "number"
            ? videoData.lengthSeconds
            : song.duration,
        cachedAt: Date.now(),
      });
    } catch (e) {
      console.error("Failed to play JioSaavn song:", e);
      clearSongLoading();
    } finally {
      setLoadingSongId((current) => (current === song.id ? null : current));
    }
  };

  const openFeaturedSong = (song: ArtistPayload["songs"][number]) => {
    if (isJioSaavnArtist) {
      void handleJioSaavnSongPress(song);
      return;
    }

    window.open(
      `https://www.youtube.com/watch?v=${encodeURIComponent(song.id)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <div className="min-h-screen text-white">
      <div className="theme-surface relative overflow-hidden rounded-2xl border">
        <button
          type="button"
          onClick={() => {
            if (backHref) {
              router.push(backHref);
              return;
            }
            router.back();
          }}
          className="theme-overlay absolute left-4 top-4 z-10 rounded-full border px-3 py-2 text-sm text-white/78 transition-colors hover:text-white"
        >
          {`← ${t("common.back")}`}
        </button>
        <div
          className="relative h-44 bg-neutral-800 sm:h-56"
          style={{
            backgroundImage: header.banner
              ? `url(${header.banner})`
              : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/15" />
          <div className="absolute inset-0 px-6 pb-5 flex flex-col justify-end">
            <div className="flex items-end gap-4">
              {header.image ? (
                <img
                  src={header.image}
                  alt={header.name}
                  className="theme-surface h-20 w-20 rounded-full border object-cover sm:h-28 sm:w-28"
                />
              ) : (
                <div className="theme-surface h-20 w-20 rounded-full border sm:h-28 sm:w-28" />
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight truncate">
                    {header.name}
                  </h1>
                  {header.verified && (
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-200">
                      {t("artist.verified")}
                    </span>
                  )}
                </div>
                {header.subscribers != null && header.subscribers > 0 && (
                  <p className="mt-1 text-white/70">
                    {t("artist.subscribers", {
                      count: formatCount(header.subscribers),
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {!data && isLoading && (
        <div className="flex justify-center py-10">
          <div className="theme-spinner h-7 w-7" />
        </div>
      )}

      {!data && !isLoading && error && (
        <div className="mt-6 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200">
          {error}
        </div>
      )}

      {data && (
        <div className="mt-6">
          {featuredSong && (
            <div className="mb-10">
              <h2 className="mb-3 text-xl font-bold">{t("artist.popular")}</h2>
              <button
                type="button"
                onClick={() => openFeaturedSong(featuredSong)}
                className="theme-surface flex w-full items-center gap-5 overflow-hidden rounded-2xl border p-4 text-left transition hover:bg-white/[0.06] md:p-5"
              >
                <div className="relative w-full max-w-[150px] shrink-0 overflow-hidden rounded-2xl md:max-w-[190px]">
                  {featuredSong.thumbnail ? (
                    <img
                      src={featuredSong.thumbnail}
                      alt={featuredSong.title}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="theme-surface-soft aspect-square w-full rounded-2xl border" />
                  )}
                  <div className="theme-overlay absolute bottom-3 left-3 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
                    {t("artist.topSong")}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/42">
                    {t("artist.mostPlayed")}
                  </p>
                  <h3 className="mt-2 truncate text-2xl font-black tracking-tight text-white md:text-3xl">
                    {featuredSong.title}
                  </h3>
                  <p className="mt-2 text-sm text-white/58">
                    {featuredSong.artist || header.name}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/65">
                    {featuredSong.views != null && featuredSong.views > 0 ? (
                      <span className="theme-surface-soft rounded-full border px-3 py-1.5">
                        {t("artist.views", {
                          count: formatCount(featuredSong.views),
                        })}
                      </span>
                    ) : null}
                    {featuredSong.duration ? (
                      <span className="theme-surface-soft rounded-full border px-3 py-1.5">
                        {formatDuration(featuredSong.duration)}
                      </span>
                    ) : null}
                    <span className="theme-button-accent rounded-full px-4 py-1.5 text-sm font-semibold">
                      {isJioSaavnArtist
                        ? t("common.playNow")
                        : t("artist.openTrack")}
                    </span>
                  </div>
                </div>
              </button>
            </div>
          )}

          {data.songs.length > 0 && (
            <div className="mb-10">
              <h2 className="mb-3 text-xl font-bold">
                {t("artist.popularTracks")}
              </h2>
              <div className="overflow-hidden">
                {data.songs.slice(0, 20).map((song, idx) =>
                  isJioSaavnArtist ? (
                    <button
                      key={`${song.id}-${idx}`}
                      type="button"
                      onClick={() => handleJioSaavnSongPress(song)}
                      disabled={loadingSongId === song.id}
                      className="flex w-full items-center gap-3 rounded-md border-b border-white/8 px-4 py-3 transition-colors hover:bg-white/5 disabled:opacity-60 group last:border-b-0"
                    >
                      <div className="w-10 flex-shrink-0 text-center text-md tabular-nums text-white/35 group-hover:hidden">
                        {loadingSongId === song.id ? "..." : idx + 1}
                      </div>
                      <div className="hidden group-hover:flex items-center justify-center w-10 flex-shrink-0">
                        <svg
                          className="h-5 w-5 text-white/45"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                      {song.thumbnail ? (
                        <img
                          src={song.thumbnail}
                          alt=""
                          className="theme-surface h-14 w-14 flex-shrink-0 rounded-lg border object-cover"
                        />
                      ) : (
                        <div className="theme-surface h-14 w-14 flex-shrink-0 rounded-lg border" />
                      )}
                      <div className="min-w-0 flex-1 text-left">
                        <div className="font-medium truncate">{song.title}</div>
                        <div className="text-sm text-white/45">
                          {song.artist || header.name}
                        </div>
                      </div>
                      <div className="mx-4 text-right text-sm tabular-nums text-white/45">
                        {song.views != null && song.views > 0 && (
                          <span>
                            {t("artist.views", {
                              count: formatCount(song.views),
                            })}
                          </span>
                        )}
                      </div>
                      <div className="w-16 flex-shrink-0 text-right text-sm tabular-nums text-white/45">
                        {formatDuration(song.duration)}
                      </div>
                    </button>
                  ) : (
                    <a
                      key={`${song.id}-${idx}`}
                      href={`https://www.youtube.com/watch?v=${encodeURIComponent(
                        song.id
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-md border-b border-white/8 px-4 py-3 transition-colors hover:bg-white/5 group last:border-b-0"
                    >
                      <div className="w-10 flex-shrink-0 text-center text-md tabular-nums text-white/35 group-hover:hidden">
                        {idx + 1}
                      </div>
                      <div className="hidden group-hover:flex items-center justify-center w-10 flex-shrink-0">
                        <svg
                          className="h-5 w-5 text-white/45"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                      {song.thumbnail ? (
                        <img
                          src={song.thumbnail}
                          alt=""
                          className="theme-surface h-14 w-14 flex-shrink-0 rounded-lg border object-cover"
                        />
                      ) : (
                        <div className="theme-surface h-14 w-14 flex-shrink-0 rounded-lg border" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{song.title}</div>
                        <div className="text-sm text-white/45">
                          {header.name}
                        </div>
                      </div>
                      <div className="mx-4 text-right text-sm tabular-nums text-white/45">
                        {song.views != null && song.views > 0 && (
                          <span>
                            {t("artist.views", {
                              count: formatCount(song.views),
                            })}
                          </span>
                        )}
                      </div>
                      <div className="w-16 flex-shrink-0 text-right text-sm tabular-nums text-white/45">
                        {formatDuration(song.duration)}
                      </div>
                    </a>
                  )
                )}
                {data.songs.length === 0 && (
                  <div className="p-4 text-white/45">{t("artist.noSongs")}</div>
                )}
              </div>
            </div>
          )}

          {data.albums.length > 0 && (
            <div className="mb-10">
              <h2 className="mb-3 text-xl font-bold">{t("artist.albums")}</h2>
              <HorizontalScrollRow
                containerClassName="pb-2 px-12"
                contentClassName="flex w-max gap-4"
              >
                {data.albums.map((album, idx) =>
                  isJioSaavnArtist ? (
                    <Link
                      key={`${album.id}-${idx}`}
                      href={buildAlbumHref(album)}
                      className="theme-surface relative min-w-[160px] max-w-[160px] rounded-2xl border p-3 transition-colors hover:bg-white/[0.06] group"
                    >
                      <div className="relative">
                        {album.thumbnail ? (
                          <img
                            src={album.thumbnail}
                            alt={album.title}
                            className="theme-surface h-full w-full rounded-xl border object-cover"
                          />
                        ) : (
                          <div className="theme-surface aspect-square w-full rounded-xl border" />
                        )}
                        <button className="theme-button-accent absolute bottom-2 left-2 flex h-10 w-10 items-center justify-center rounded-full opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                          <svg
                            className="w-5 h-5 text-black ml-0.5"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </button>
                      </div>
                      <div className="mt-2 font-medium truncate">
                        {album.title}
                      </div>
                      <div className="text-sm text-white/45">
                        {album.year ||
                          (album.songCount
                            ? t("artist.songCount", { count: album.songCount })
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
                      href={album.id.startsWith("http") ? album.id : undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="theme-surface relative min-w-[160px] max-w-[160px] rounded-2xl border p-3 transition-colors hover:bg-white/[0.06] group"
                    >
                      <div className="relative">
                        {album.thumbnail ? (
                          <img
                            src={album.thumbnail}
                            alt={album.title}
                            className="theme-surface h-full w-full rounded-xl border object-cover"
                          />
                        ) : (
                          <div className="theme-surface aspect-square w-full rounded-xl border" />
                        )}
                        <button className="theme-button-accent absolute bottom-2 left-2 flex h-10 w-10 items-center justify-center rounded-full opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                          <svg
                            className="w-5 h-5 text-black ml-0.5"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </button>
                      </div>
                      <div className="mt-2 font-medium truncate">
                        {album.title}
                      </div>
                      <div className="text-sm text-white/45">
                        {album.year ||
                          (album.songCount
                            ? t("artist.songCount", { count: album.songCount })
                            : album.videoCount
                            ? t("artist.videoCount", {
                                count: album.videoCount,
                              })
                            : "")}
                      </div>
                    </a>
                  )
                )}
                {data.albums.length === 0 && (
                  <div className="text-white/45">{t("artist.noAlbums")}</div>
                )}
              </HorizontalScrollRow>
            </div>
          )}

          {data.playlists.length > 0 && (
            <div className="mb-10">
              <h2 className="mb-3 text-xl font-bold">
                {t("artist.playlists")}
              </h2>
              <HorizontalScrollRow
                containerClassName="pb-2"
                containerStyle={{ paddingInlineEnd: "3rem" }}
                contentClassName="flex w-max gap-4"
              >
                {data.playlists.map((p, idx) => (
                  <Link
                    key={`${p.id}-${idx}`}
                    href={buildPlaylistHref(p)}
                    className="theme-surface relative min-w-[160px] max-w-[160px] rounded-2xl border p-3 transition-colors hover:bg-white/[0.06] group"
                  >
                    <div className="relative">
                      {p.thumbnail ? (
                        <img
                          src={p.thumbnail}
                          alt={p.title}
                          className="theme-surface h-full w-full rounded-xl border object-cover"
                        />
                      ) : (
                        <div className="theme-surface aspect-square w-full rounded-xl border" />
                      )}
                      <button className="theme-button-accent absolute bottom-2 left-2 flex h-10 w-10 items-center justify-center rounded-full opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                        <svg
                          className="w-5 h-5 text-black ml-0.5"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </button>
                    </div>
                    <div className="mt-2 font-medium truncate">{p.title}</div>
                    {p.videoCount != null && p.videoCount > 0 && (
                      <div className="text-sm text-white/45">
                        {t("artist.videoCount", { count: p.videoCount })}
                      </div>
                    )}
                  </Link>
                ))}
                {data.playlists.length === 0 && (
                  <div className="text-white/45">{t("artist.noPlaylists")}</div>
                )}
              </HorizontalScrollRow>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
