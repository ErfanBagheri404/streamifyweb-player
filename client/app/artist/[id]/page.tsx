"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAudio } from "../../contexts/AudioContext";
import { HorizontalScrollRow } from "../../components/HorizontalScrollRow";

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

function formatCount(value?: number): string {
  if (value == null) return "";
  if (value < 1000) return `${value}`;
  if (value < 1000000) return `${(value / 1000).toFixed(1).replace(".0", "")}K`;
  if (value < 1000000000)
    return `${(value / 1000000).toFixed(1).replace(".0", "")}M`;
  return `${(value / 1000000000).toFixed(1).replace(".0", "")}B`;
}

export default function ArtistPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { beginSongLoad, playSong, clearSongLoading } = useAudio();

  const id = params.id;
  const initialName = searchParams.get("name") || "";
  const initialImage = searchParams.get("image") || "";
  const sourceParam =
    searchParams.get("source") ||
    (searchParams.get("search_source") === "jiosaavn" ? "jiosaavn" : "");

  const [data, setData] = useState<ArtistPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingSongId, setLoadingSongId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
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
        if (!cancelled) setData(json as ArtistPayload);
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
  }, [id, sourceParam]);

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

  const buildAlbumHref = (album: ArtistPayload["albums"][number]) => {
    const params = new URLSearchParams();
    params.set("title", album.title || "");
    params.set("author", header.name);
    params.set("source", "jiosaavn");
    if (album.thumbnail) params.set("image", album.thumbnail);
    if (album.url) params.set("href", album.url);
    if (album.songCount != null) params.set("count", String(album.songCount));
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

  return (
    <div className="min-h-screen text-white">
      <div className="rounded-2xl border border-neutral-800 overflow-hidden bg-neutral-900/40 relative">
        <Link
          href="/search"
          className="absolute top-4 left-4 z-10 text-neutral-300 hover:text-white transition-colors bg-black/50 backdrop-blur-sm px-3 py-2 rounded-full text-sm"
        >
          ← Back
        </Link>
        <div
          className="relative h-44 sm:h-56 bg-neutral-800"
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
                  className="w-20 h-20 sm:w-28 sm:h-28 rounded-full object-cover bg-neutral-800 border border-white/10"
                />
              ) : (
                <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-neutral-800 border border-white/10" />
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight truncate">
                    {header.name}
                  </h1>
                  {header.verified && (
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-200">
                      Verified
                    </span>
                  )}
                </div>
                {header.subscribers != null && header.subscribers > 0 && (
                  <p className="text-neutral-300 mt-1">
                    {formatCount(header.subscribers)} subscribers
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="py-10 flex justify-center">
          <div className="inline-block w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && error && (
        <div className="mt-6 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200">
          {error}
        </div>
      )}

      {!isLoading && !error && data && (
        <div className="mt-6">
          {data.songs.length > 0 && (
            <div className="mb-10">
              <h2 className="text-xl font-bold mb-3">Popular</h2>
              <div className="overflow-hidden">
                {data.songs.slice(0, 20).map((song, idx) =>
                  isJioSaavnArtist ? (
                    <button
                      key={`${song.id}-${idx}`}
                      type="button"
                      onClick={() => handleJioSaavnSongPress(song)}
                      disabled={loadingSongId === song.id}
                      className="flex w-full items-center gap-3 px-4 py-3 hover:bg-white/5 border-b rounded-md border-neutral-800 last:border-b-0 transition-colors group disabled:opacity-60"
                    >
                      <div className="w-10 flex-shrink-0 text-neutral-500 tabular-nums text-center text-md group-hover:hidden">
                        {loadingSongId === song.id ? "..." : idx + 1}
                      </div>
                      <div className="hidden group-hover:flex items-center justify-center w-10 flex-shrink-0">
                        <svg
                          className="w-5 h-5 text-neutral-400"
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
                          className="w-14 h-14 rounded-lg object-cover bg-neutral-800 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-neutral-800 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1 text-left">
                        <div className="font-medium truncate">{song.title}</div>
                        <div className="text-sm text-neutral-500">
                          {song.artist || header.name}
                        </div>
                      </div>
                      <div className="text-sm text-neutral-500 tabular-nums text-right mx-4">
                        {song.views != null && song.views > 0 && (
                          <span>{formatCount(song.views)} views</span>
                        )}
                      </div>
                      <div className="text-sm text-neutral-500 tabular-nums text-right w-16 flex-shrink-0">
                        {song.duration
                          ? `${Math.floor(song.duration / 60)}:${String(
                              song.duration % 60
                            ).padStart(2, "0")}`
                          : ""}
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
                      className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 border-b rounded-md border-neutral-800 last:border-b-0 transition-colors group"
                    >
                      <div className="w-10 flex-shrink-0 text-neutral-500 tabular-nums text-center text-md group-hover:hidden">
                        {idx + 1}
                      </div>
                      <div className="hidden group-hover:flex items-center justify-center w-10 flex-shrink-0">
                        <svg
                          className="w-5 h-5 text-neutral-400"
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
                          className="w-14 h-14 rounded-lg object-cover bg-neutral-800 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-neutral-800 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{song.title}</div>
                        <div className="text-sm text-neutral-500">
                          {header.name}
                        </div>
                      </div>
                      <div className="text-sm text-neutral-500 tabular-nums text-right mx-4">
                        {song.views != null && song.views > 0 && (
                          <span>{formatCount(song.views)} views</span>
                        )}
                      </div>
                      <div className="text-sm text-neutral-500 tabular-nums text-right w-16 flex-shrink-0">
                        {song.duration
                          ? `${Math.floor(song.duration / 60)}:${String(
                              song.duration % 60
                            ).padStart(2, "0")}`
                          : ""}
                      </div>
                    </a>
                  )
                )}
                {data.songs.length === 0 && (
                  <div className="p-4 text-neutral-400">No songs found.</div>
                )}
              </div>
            </div>
          )}

          {data.albums.length > 0 && (
            <div className="mb-10">
              <h2 className="text-xl font-bold mb-3">Albums</h2>
              <HorizontalScrollRow
                containerClassName="pb-2 px-12"
                contentClassName="flex w-max gap-4"
              >
                {data.albums.map((album, idx) =>
                  isJioSaavnArtist ? (
                    <Link
                      key={`${album.id}-${idx}`}
                      href={buildAlbumHref(album)}
                      className="min-w-[160px] max-w-[160px] p-3 rounded-2xl bg-neutral-900/40 hover:bg-neutral-900/60 transition-colors group relative"
                    >
                      <div className="relative">
                        {album.thumbnail ? (
                          <img
                            src={album.thumbnail}
                            alt={album.title}
                            className="w-full aspect-square rounded-xl object-cover bg-neutral-800"
                          />
                        ) : (
                          <div className="w-full aspect-square rounded-xl bg-neutral-800" />
                        )}
                        <button className="absolute bottom-2 left-2 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
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
                      <div className="text-sm text-neutral-500">
                        {album.year ||
                          (album.songCount
                            ? `${album.songCount} songs`
                            : album.videoCount
                            ? `${album.videoCount} videos`
                            : "")}
                      </div>
                    </Link>
                  ) : (
                    <a
                      key={`${album.id}-${idx}`}
                      href={album.id.startsWith("http") ? album.id : undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-[160px] max-w-[160px] p-3 rounded-2xl bg-neutral-900/40 hover:bg-neutral-900/60 transition-colors group relative"
                    >
                      <div className="relative">
                        {album.thumbnail ? (
                          <img
                            src={album.thumbnail}
                            alt={album.title}
                            className="w-full aspect-square rounded-xl object-cover bg-neutral-800"
                          />
                        ) : (
                          <div className="w-full aspect-square rounded-xl bg-neutral-800" />
                        )}
                        <button className="absolute bottom-2 left-2 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
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
                      <div className="text-sm text-neutral-500">
                        {album.year ||
                          (album.songCount
                            ? `${album.songCount} songs`
                            : album.videoCount
                            ? `${album.videoCount} videos`
                            : "")}
                      </div>
                    </a>
                  )
                )}
                {data.albums.length === 0 && (
                  <div className="text-neutral-400">No albums found.</div>
                )}
              </HorizontalScrollRow>
            </div>
          )}

          {data.playlists.length > 0 && (
            <div className="mb-10">
              <h2 className="text-xl font-bold mb-3">Playlists</h2>
              <HorizontalScrollRow
                containerClassName="pb-2 px-12"
                contentClassName="flex w-max gap-4"
              >
                {data.playlists.map((p, idx) => (
                  <a
                    key={`${p.id}-${idx}`}
                    href={`https://www.youtube.com/playlist?list=${encodeURIComponent(
                      p.id
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-[160px] max-w-[160px] p-3 rounded-2xl bg-neutral-900/40 hover:bg-neutral-900/60 transition-colors group relative"
                  >
                    <div className="relative">
                      {p.thumbnail ? (
                        <img
                          src={p.thumbnail}
                          alt={p.title}
                          className="w-full aspect-square rounded-xl object-cover bg-neutral-800"
                        />
                      ) : (
                        <div className="w-full aspect-square rounded-xl bg-neutral-800" />
                      )}
                      <button className="absolute bottom-2 left-2 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
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
                      <div className="text-sm text-neutral-500">
                        {p.videoCount} videos
                      </div>
                    )}
                  </a>
                ))}
                {data.playlists.length === 0 && (
                  <div className="text-neutral-400">No playlists found.</div>
                )}
              </HorizontalScrollRow>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
