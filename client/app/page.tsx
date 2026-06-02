"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HorizontalScrollRow } from "./components/HorizontalScrollRow";
import { type Song, useAudio } from "./contexts/AudioContext";

const HOME_ARTIST_BANNER_CACHE_KEY = "homeArtistBannerCache";

type ArtistHistorySummary = {
  key: string;
  name: string;
  artistId?: string;
  image?: string;
  source?: string;
  count: number;
  songs: Song[];
};

type RemoteArtistPayload = {
  artist?: {
    name?: string;
    image?: string;
    banner?: string;
    source?: string;
  };
};

type HomeArtistBannerCache = Record<
  string,
  {
    banner: string;
    cachedAt: number;
  }
>;

function readHomeArtistBannerCache(): HomeArtistBannerCache {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(HOME_ARTIST_BANNER_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as HomeArtistBannerCache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeHomeArtistBannerCache(cache: HomeArtistBannerCache) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      HOME_ARTIST_BANNER_CACHE_KEY,
      JSON.stringify(cache)
    );
  } catch {}
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

function NoteGlyph() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-8 w-8"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.75 5.75v9.15a2.85 2.85 0 1 1-1.5-2.5V7.45l6-1.5v7.2a2.85 2.85 0 1 1-1.5-2.5V4.05l-9 2.25"
      />
    </svg>
  );
}

function formatDuration(seconds?: number): string {
  if (!seconds || Number.isNaN(seconds)) return "Recently played";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function isYouTubeSong(song: Song): boolean {
  const source = (song.source || "").toLowerCase();
  return source === "youtube" || source === "youtubemusic";
}

function dedupeSongsById(songs: Song[]): Song[] {
  const seen = new Set<string>();
  const output: Song[] = [];

  for (const song of songs) {
    if (!song?.id || seen.has(song.id)) continue;
    seen.add(song.id);
    output.push(song);
  }

  return output;
}

function buildArtistHref(artist: {
  artistId?: string;
  name: string;
  image?: string;
  source?: string;
}): string | null {
  if (!artist.artistId) return null;

  const params = new URLSearchParams();
  if (artist.name) params.set("name", artist.name);
  if (artist.image) params.set("image", artist.image);
  if (artist.source) params.set("source", artist.source);

  const query = params.toString();
  return `/artist/${encodeURIComponent(artist.artistId)}${
    query ? `?${query}` : ""
  }`;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning!";
  if (hour < 18) return "Good Afternoon!";
  return "Good Evening!";
}

function SongCard({ song, onPlay }: { song: Song; onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className="group min-w-[168px] max-w-[168px] text-left"
    >
      <div className="relative overflow-hidden rounded-2xl bg-[#1a1a1a] transition duration-200 group-hover:bg-[#202020]">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-white/6">
          {song.coverUrl ? (
            <Image
              src={song.coverUrl}
              alt={song.title}
              fill
              sizes="168px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#2d2d2d] to-[#161616] text-white/60">
              <NoteGlyph />
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute bottom-3 right-3 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-[#9dff00] text-black opacity-0 shadow-[0_12px_26px_rgba(0,0,0,0.35)] transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          <PlayGlyph />
        </div>
      </div>
      <div className="px-1 pt-3">
        <p className="truncate text-[15px] font-semibold text-white">
          {song.title}
        </p>
        <p className="mt-1 truncate text-sm text-white/55">
          {song.artist || "Unknown Artist"}
        </p>
        <p className="mt-1 truncate text-xs text-white/38">
          {formatDuration(song.duration)}
        </p>
      </div>
    </button>
  );
}

function ArtistCard({ artist }: { artist: ArtistHistorySummary }) {
  const href = buildArtistHref(artist);
  const content = (
    <>
      <div className="relative aspect-square overflow-hidden rounded-full bg-[#1a1a1a]">
        {artist.image ? (
          <Image
            src={artist.image}
            alt={artist.name}
            fill
            sizes="168px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#343434] to-[#181818] text-white/70">
            <NoteGlyph />
          </div>
        )}
      </div>
      <div className="px-1 pt-3 text-center">
        <p className="truncate text-[15px] font-semibold text-white">
          {artist.name}
        </p>
        <p className="mt-1 truncate text-sm text-white/55">
          {artist.count} {artist.count === 1 ? "play" : "plays"}
        </p>
      </div>
    </>
  );

  if (!href) {
    return <div className="min-w-[168px] max-w-[168px]">{content}</div>;
  }

  return (
    <Link
      href={href}
      className="min-w-[168px] max-w-[168px] transition duration-200 hover:opacity-90"
    >
      {content}
    </Link>
  );
}

export default function Home() {
  const { recentSongs, resolveAndPlaySong } = useAudio();
  const [heroBanner, setHeroBanner] = useState("");

  const uniqueRecentSongs = useMemo(
    () => dedupeSongsById(recentSongs).slice(0, 12),
    [recentSongs]
  );

  const recentArtists = useMemo<ArtistHistorySummary[]>(() => {
    const artistMap = new Map<string, ArtistHistorySummary>();

    for (const song of recentSongs) {
      const artistName = song.artist?.trim();
      if (!artistName) continue;

      const key = song.artistId?.trim() || artistName.toLowerCase();
      const existing = artistMap.get(key);

      if (existing) {
        existing.count += 1;
        existing.songs.push(song);
        if (!existing.artistId && song.artistId)
          existing.artistId = song.artistId;
        if (!existing.image) {
          existing.image = song.artistImage || song.coverUrl;
        }
        if (!existing.source) {
          existing.source = song.artistSource || song.source;
        }
        continue;
      }

      artistMap.set(key, {
        key,
        name: artistName,
        artistId: song.artistId,
        image: song.artistImage || song.coverUrl,
        source: song.artistSource || song.source,
        count: 1,
        songs: [song],
      });
    }

    return [...artistMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [recentSongs]);

  const mostPlayedYouTubeArtist = useMemo<ArtistHistorySummary | null>(() => {
    const artistMap = new Map<string, ArtistHistorySummary>();

    for (const song of recentSongs) {
      const artistId = song.artistId?.trim();
      const artistName = song.artist?.trim();
      if (!artistId || !artistName || !isYouTubeSong(song)) continue;

      const existing = artistMap.get(artistId);
      if (existing) {
        existing.count += 1;
        existing.songs.push(song);
        if (!existing.image) {
          existing.image = song.artistImage || song.coverUrl;
        }
        continue;
      }

      artistMap.set(artistId, {
        key: artistId,
        name: artistName,
        artistId,
        image: song.artistImage || song.coverUrl,
        source: song.artistSource || song.source,
        count: 1,
        songs: [song],
      });
    }

    const sortedArtists = [...artistMap.values()].sort(
      (a, b) => b.count - a.count
    );
    return sortedArtists[0] || null;
  }, [recentSongs]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!mostPlayedYouTubeArtist?.artistId) {
        setHeroBanner("");
        return;
      }

      const artistId = mostPlayedYouTubeArtist.artistId;
      const bannerCache = readHomeArtistBannerCache();
      const cachedBanner = bannerCache[artistId]?.banner;

      if (cachedBanner) {
        setHeroBanner(cachedBanner);
        return;
      }

      try {
        const params = new URLSearchParams({
          id: artistId,
          source: "youtube",
        });
        const response = await fetch(`/api/artist?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as RemoteArtistPayload;

        if (!response.ok || cancelled) return;

        const nextBanner = payload.artist?.banner || "";
        setHeroBanner(nextBanner);

        if (nextBanner) {
          bannerCache[artistId] = {
            banner: nextBanner,
            cachedAt: Date.now(),
          };
          writeHomeArtistBannerCache(bannerCache);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load home hero artist details:", error);
          setHeroBanner("");
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [mostPlayedYouTubeArtist?.artistId]);

  const heroSongs = useMemo(
    () => dedupeSongsById(mostPlayedYouTubeArtist?.songs || []),
    [mostPlayedYouTubeArtist]
  );

  const playQueue = async (queue: Song[], song: Song) => {
    try {
      const currentIndex = Math.max(
        queue.findIndex((entry) => entry.id === song.id),
        0
      );

      await resolveAndPlaySong(song, {
        queue,
        currentIndex,
      });
    } catch (error) {
      console.error("Failed to start playback from home:", error);
    }
  };

  return (
    <div className="min-h-full text-white">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-2xl font-bold tracking-tight text-white">
            {getGreeting()}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Sign Up
            </button>
            <button
              type="button"
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Sign In
            </button>
          </div>
        </div>

        {mostPlayedYouTubeArtist && heroSongs[0] ? (
          <section className="relative overflow-hidden rounded-2xl  bg-[#181818]">
            {heroBanner ? (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${heroBanner})` }}
              />
            ) : null}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.1)_0%,rgba(0,0,0,0.35)_45%,rgba(0,0,0,0.88)_100%)]" />
            {!heroBanner ? (
              <div className="absolute inset-0 bg-[linear-gradient(135deg,#1a1a1a_0%,#151515_48%,#101010_100%)]" />
            ) : null}

            <div className="relative z-10 flex min-h-[300px] flex-col justify-between p-6 md:min-h-[360px] md:p-8">
              <h1 className="max-w-[70%] text-4xl font-black tracking-tight text-white md:text-5xl">
                {mostPlayedYouTubeArtist.name}
              </h1>

              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => void playQueue(heroSongs, heroSongs[0])}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-[0_16px_40px_rgba(0,0,0,0.35)] transition hover:scale-[1.03] md:h-20 md:w-20"
                  aria-label={`Play songs by ${mostPlayedYouTubeArtist.name}`}
                >
                  <PlayGlyph className="h-7 w-7 md:h-8 md:w-8" />
                </button>
              </div>

              <div />
            </div>
          </section>
        ) : (
          <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(135deg,#1a1a1a_0%,#151515_48%,#101010_100%)] p-6 md:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/55">
              Home
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white md:text-4xl">
              Start playing music to build your home mix
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/60 md:text-base">
              Your most played YouTube artist, recent songs, and recent artists
              show up here once you have some listening history.
            </p>
          </section>
        )}

        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-bold tracking-tight">
              Recently Played
            </h2>
          </div>

          {uniqueRecentSongs.length > 0 ? (
            <HorizontalScrollRow
              containerClassName="pb-2"
              contentClassName="flex w-max gap-4"
            >
              {uniqueRecentSongs.map((song) => (
                <SongCard
                  key={song.id}
                  song={song}
                  onPlay={() => void playQueue(uniqueRecentSongs, song)}
                />
              ))}
            </HorizontalScrollRow>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white/55">
              No recently played songs yet.
            </div>
          )}
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-bold tracking-tight">
              Recently Played Artists
            </h2>
          </div>

          {recentArtists.length > 0 ? (
            <HorizontalScrollRow
              containerClassName="pb-2"
              contentClassName="flex w-max gap-4"
            >
              {recentArtists.map((artist) => (
                <ArtistCard key={artist.key} artist={artist} />
              ))}
            </HorizontalScrollRow>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white/55">
              No recently played artists yet.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
