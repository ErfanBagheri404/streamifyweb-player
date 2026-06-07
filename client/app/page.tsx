"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HorizontalScrollRow } from "./components/HorizontalScrollRow";
import { type Song, useAudio } from "./contexts/AudioContext";
import { useAppLanguage } from "./hooks/useAppLanguage";
import { readSessionCache, writeSessionCache } from "./lib/session-cache";

const HOME_ARTIST_BANNER_CACHE_KEY = "homeArtistBannerCache";
const HOME_MADE_FOR_YOU_CACHE_KEY = "homeMadeForYouCache";

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

type HomeMadeForYouCache = {
  seedSong: Song | null;
  songs: Song[];
};

function normalizeMadeForYouSongs(
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
    deduped.push({
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
      duration:
        typeof record.duration === "number"
          ? record.duration
          : typeof record.duration === "string"
          ? Number.parseInt(record.duration, 10) || undefined
          : undefined,
      uploaded:
        typeof record.uploaded === "string" && record.uploaded.trim()
          ? record.uploaded
          : undefined,
      source:
        typeof record.source === "string" && record.source.trim()
          ? record.source
          : fallbackSource,
      url:
        typeof record.url === "string" && record.url.trim()
          ? record.url
          : undefined,
    });
  }

  return deduped;
}

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

function rankMadeForYouCandidates(songs: Song[]): Song[] {
  if (songs.length === 0) return [];

  const artistPlayCount = new Map<string, number>();
  for (const song of songs) {
    const artistKey = song.artist?.trim().toLowerCase();
    if (!artistKey) continue;
    artistPlayCount.set(artistKey, (artistPlayCount.get(artistKey) || 0) + 1);
  }

  const deduped = dedupeSongsById(songs);

  return [...deduped].sort((left, right) => {
    const scoreSong = (song: Song, index: number) => {
      const source = (song.source || "").toLowerCase();
      const artistKey = song.artist?.trim().toLowerCase() || "";
      const artistScore = artistKey ? artistPlayCount.get(artistKey) || 0 : 0;

      let score = Math.max(24 - index, 0);
      score += Math.min(song.relatedSongs?.length || 0, 10) * 20;
      score += Math.min(artistScore, 5) * 12;

      if (source === "youtube" || source === "youtubemusic") score += 40;
      else if (source === "jiosaavn") score += 18;
      else if (source === "soundcloud") score += 10;

      if (song.coverUrl) score += 6;
      if (song.duration) score += 4;

      return score;
    };

    return scoreSong(right, deduped.indexOf(right)) - scoreSong(left, deduped.indexOf(left));
  });
}

function buildArtistHref(artist: {
  artistId?: string;
  name: string;
  image?: string;
  source?: string;
}): string | null {
  if (!artist.artistId) return null;

  if (artist.source && artist.source !== "youtube") {
    const params = new URLSearchParams();
    params.set("source", artist.source);
    return `/artist/${encodeURIComponent(
      artist.artistId
    )}?${params.toString()}`;
  }

  return `/artist/${encodeURIComponent(artist.artistId)}`;
}

function SongCard({ song, onPlay }: { song: Song; onPlay: () => void }) {
  const { t } = useAppLanguage();
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
          {song.artist || t("home.unknownArtist")}
        </p>
        <p className="mt-1 truncate text-xs text-white/38">
          {formatDuration(song.duration)}
        </p>
      </div>
    </button>
  );
}

function ArtistCard({ artist }: { artist: ArtistHistorySummary }) {
  const { t } = useAppLanguage();
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
          {t("home.play", { count: artist.count })}
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
  const { t } = useAppLanguage();
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t("home.greetingMorning");
    if (hour < 18) return t("home.greetingAfternoon");
    return t("home.greetingEvening");
  }, [t]);
  const initialMadeForYouCache =
    typeof window === "undefined"
      ? null
      : readSessionCache<HomeMadeForYouCache>(HOME_MADE_FOR_YOU_CACHE_KEY);
  const [heroBanner, setHeroBanner] = useState("");
  const [madeForYouSeedSong, setMadeForYouSeedSong] = useState<Song | null>(
    initialMadeForYouCache?.seedSong || null
  );
  const [madeForYouSongs, setMadeForYouSongs] = useState<Song[]>(
    initialMadeForYouCache?.songs || []
  );
  const [isLoadingMadeForYou, setIsLoadingMadeForYou] = useState(false);
  const [authNotice, setAuthNotice] = useState<{
    title: string;
    body: string;
  } | null>(null);

  useEffect(() => {
    if (!authNotice) return;

    const timeoutId = window.setTimeout(() => {
      setAuthNotice(null);
    }, 2600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [authNotice]);

  const uniqueRecentSongs = useMemo(
    () => dedupeSongsById(recentSongs).slice(0, 12),
    [recentSongs]
  );
  const madeForYouSeedCandidates = useMemo(
    () => rankMadeForYouCandidates(recentSongs).slice(0, 6),
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

  useEffect(() => {
    writeSessionCache<HomeMadeForYouCache>(HOME_MADE_FOR_YOU_CACHE_KEY, {
      seedSong: madeForYouSeedSong,
      songs: madeForYouSongs,
    });
  }, [madeForYouSeedSong, madeForYouSongs]);

  useEffect(() => {
    let cancelled = false;

    const loadMadeForYou = async () => {
      if (madeForYouSeedCandidates.length === 0) {
        setMadeForYouSeedSong(null);
        setMadeForYouSongs([]);
        setIsLoadingMadeForYou(false);
        return;
      }

      if (
        madeForYouSeedSong &&
        madeForYouSongs.length > 0 &&
        madeForYouSeedCandidates.some((song) => song.id === madeForYouSeedSong.id)
      ) {
        setIsLoadingMadeForYou(false);
        return;
      }

      setIsLoadingMadeForYou(true);

      try {
        for (const candidate of madeForYouSeedCandidates) {
          const seededSongs = dedupeSongsById(candidate.relatedSongs || []).filter(
            (song) => song.id !== candidate.id
          );

          if (seededSongs.length > 0) {
            if (!cancelled) {
              setMadeForYouSeedSong(candidate);
              setMadeForYouSongs(seededSongs.slice(0, 12));
            }
            return;
          }

          const params = new URLSearchParams({
            id: candidate.id,
            title: candidate.title,
            artist: candidate.artist,
          });
          if (candidate.source) {
            params.set("source", candidate.source);
          }
          if (candidate.url) {
            params.set("url", candidate.url);
          }

          const response = await fetch(`/api/video?${params.toString()}`, {
            cache: "no-store",
          });
          const payload = (await response.json()) as Record<string, unknown>;
          if (!response.ok || cancelled) {
            continue;
          }

          const nextSongs = normalizeMadeForYouSongs(
            payload.relatedSongs,
            candidate.source
          )
            .filter((song) => song.id !== candidate.id)
            .slice(0, 12);

          if (nextSongs.length > 0) {
            if (!cancelled) {
              setMadeForYouSeedSong(candidate);
              setMadeForYouSongs(nextSongs);
            }
            return;
          }
        }

        if (!cancelled) {
          setMadeForYouSeedSong(madeForYouSeedCandidates[0] || null);
          setMadeForYouSongs([]);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load Made For You songs:", error);
          setMadeForYouSongs([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMadeForYou(false);
        }
      }
    };

    void loadMadeForYou();

    return () => {
      cancelled = true;
    };
  }, [madeForYouSeedCandidates, madeForYouSeedSong, madeForYouSongs.length]);

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

  const showAuthDisabledNotice = (mode: "signup" | "signin") => {
    setAuthNotice({
      title:
        mode === "signup" ? t("home.signUpDisabled") : t("home.signInDisabled"),
      body: t("home.authDisabledBody"),
    });
  };

  return (
    <div className="min-h-full text-white">
      <div
        className={`pointer-events-none fixed left-1/2 top-6 z-40 flex -translate-x-1/2 transition-all duration-200 ${
          authNotice ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
        }`}
      >
        {authNotice ? (
          <div className="theme-overlay pointer-events-auto w-[min(92vw,420px)] rounded-2xl border px-4 py-3 text-white shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <p className="text-sm font-semibold">{authNotice.title}</p>
            <p className="mt-1 text-sm text-white/62">{authNotice.body}</p>
          </div>
        ) : null}
      </div>

      <div className="space-y-5 md:space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-2xl font-bold tracking-tight text-white">
            {greeting}
          </p>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={() => showAuthDisabledNotice("signup")}
              className="theme-button-soft rounded-full border px-4 py-2 text-sm font-semibold transition"
            >
              {t("home.signUp")}
            </button>
            <button
              type="button"
              onClick={() => showAuthDisabledNotice("signin")}
              className="theme-button-solid rounded-full px-4 py-2 text-sm font-semibold transition"
            >
              {t("home.signIn")}
            </button>
          </div>
        </div>

        {mostPlayedYouTubeArtist && heroSongs[0] ? (
          <section
            className={`theme-surface relative overflow-hidden rounded-2xl ${
              heroBanner ? "" : "border"
            }`}
          >
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

            <div className="relative z-10 flex min-h-[240px] flex-col justify-between p-5 sm:p-6 md:min-h-[360px] md:p-8">
              <h1 className="max-w-full text-3xl font-black tracking-tight text-white sm:text-4xl md:max-w-[70%] md:text-5xl">
                {mostPlayedYouTubeArtist.name}
              </h1>

              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => void playQueue(heroSongs, heroSongs[0])}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-[0_16px_40px_rgba(0,0,0,0.35)] transition hover:scale-[1.03] md:h-20 md:w-20"
                  aria-label={t("home.playSongsBy", {
                    name: mostPlayedYouTubeArtist.name,
                  })}
                >
                  <PlayGlyph className="h-6 w-6 md:h-8 md:w-8" />
                </button>
              </div>

              <div />
            </div>
          </section>
        ) : (
          <section className="theme-surface rounded-2xl border p-5 sm:p-6 md:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/55">
              {t("home.emptyHeroEyebrow")}
            </p>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl md:text-4xl">
              {t("home.emptyHeroTitle")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/60 md:text-base">
              {t("home.emptyHeroDescription")}
            </p>
          </section>
        )}

        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-bold tracking-tight">
              {t("home.recentlyPlayed")}
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
            <div className="theme-surface-soft rounded-2xl border p-5 text-white/55">
              {t("home.noRecentSongs")}
            </div>
          )}
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                {t("home.madeForYou")}
              </h2>
              {madeForYouSeedSong ? (
                <p className="mt-1 text-sm text-white/50">
                  {t("home.basedOn", { title: madeForYouSeedSong.title })}
                </p>
              ) : null}
            </div>
          </div>

          {madeForYouSongs.length > 0 ? (
            <HorizontalScrollRow
              containerClassName="pb-2"
              contentClassName="flex w-max gap-4"
            >
              {madeForYouSongs.map((song) => (
                <SongCard
                  key={song.id}
                  song={song}
                  onPlay={() => void playQueue(madeForYouSongs, song)}
                />
              ))}
            </HorizontalScrollRow>
          ) : (
            <div className="theme-surface-soft rounded-2xl border p-5 text-white/55">
              {isLoadingMadeForYou ? (
                <div className="flex items-center gap-3">
                  <span className="theme-spinner h-5 w-5" />
                  <span className="loading-dots">
                    {t("common.loadingRecommendations")}
                  </span>
                </div>
              ) : (
                t("home.playYoutubeToBuildMix")
              )}
            </div>
          )}
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-bold tracking-tight">
              {t("home.playedArtists")}
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
            <div className="theme-surface-soft rounded-2xl border p-5 text-white/55">
              {t("home.noRecentArtists")}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
