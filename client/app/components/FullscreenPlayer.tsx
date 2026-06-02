"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useAudio } from "../contexts/AudioContext";
import {
  buildTimedLyrics,
  fetchLyrics,
  findActiveLyricIndex,
  TimedLyricLine,
} from "../lib/lyrics";

const DEFAULT_PALETTE = {
  primary: [138, 18, 7] as [number, number, number],
  secondary: [52, 16, 14] as [number, number, number],
};
const LYRICS_MANUAL_SCROLL_HOLD_MS = 1500;
const LYRICS_USER_SCROLL_INTENT_MS = 1200;

function formatTime(time: number): string {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function rgbToCss([r, g, b]: [number, number, number], alpha = 1): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function ChevronDownGlyph() {
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
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ExpandGlyph() {
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
        d="M14.5 4.75h4.75V9.5"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m19.25 4.75-6.5 6.5"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.5 19.25H4.75V14.5"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m4.75 19.25 6.5-6.5"
      />
    </svg>
  );
}

function extractPaletteFromImage(image: HTMLImageElement): {
  primary: [number, number, number];
  secondary: [number, number, number];
} {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas context unavailable");
  }

  const sampleSize = 24;
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  context.drawImage(image, 0, 0, sampleSize, sampleSize);

  const { data } = context.getImageData(0, 0, sampleSize, sampleSize);
  const buckets = new Map<
    string,
    { count: number; color: [number, number, number]; weight: number }
  >();

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha < 120) continue;

    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const brightness = red * 0.299 + green * 0.587 + blue * 0.114;

    if (brightness < 22) continue;

    const quantized: [number, number, number] = [
      Math.round(red / 24) * 24,
      Math.round(green / 24) * 24,
      Math.round(blue / 24) * 24,
    ];

    const key = quantized.join(",");
    const saturation = Math.max(...quantized) - Math.min(...quantized);
    const weight = saturation + brightness * 0.35;
    const existing = buckets.get(key);

    if (existing) {
      existing.count += 1;
      existing.weight += weight;
    } else {
      buckets.set(key, { count: 1, color: quantized, weight });
    }
  }

  const rankedColors = [...buckets.values()].sort(
    (left, right) => right.weight - left.weight || right.count - left.count
  );

  const primary = rankedColors[0]?.color ?? [138, 18, 7];
  const secondary = rankedColors.find(({ color }) => {
    const distance =
      Math.abs(color[0] - primary[0]) +
      Math.abs(color[1] - primary[1]) +
      Math.abs(color[2] - primary[2]);
    return distance > 84;
  })?.color ?? [primary[0], Math.min(255, primary[1] + 28), primary[2]];

  return { primary, secondary };
}

export default function FullscreenPlayer() {
  const {
    currentSong,
    recentSongs,
    playbackQueue,
    queueIndex,
    currentTime,
    duration,
    seekTo,
    closeFullscreen,
    playQueueIndex,
    resolveAndPlaySong,
  } = useAudio();
  const [relatedPalette, setRelatedPalette] = useState(DEFAULT_PALETTE);
  const [lyricsText, setLyricsText] = useState("");
  const [lyricsState, setLyricsState] = useState<{
    loading: boolean;
    error: string | null;
    isSynced: boolean;
  }>({
    loading: false,
    error: null,
    isSynced: false,
  });
  const [manualLyricsArtist, setManualLyricsArtist] = useState("");
  const [manualLyricsTitle, setManualLyricsTitle] = useState("");
  const [lyricsManualModeUntil, setLyricsManualModeUntil] = useState(0);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const lyricItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isProgrammaticLyricsScrollRef = useRef(false);
  const lyricsScrollReleaseTimerRef = useRef<number | null>(null);
  const lyricsUserScrollIntentUntilRef = useRef(0);

  const upNextSongs = useMemo(() => {
    if (!currentSong || queueIndex < 0) return [];
    const deduped: (typeof playbackQueue)[number][] = [];
    const seen = new Set<string>();
    for (const song of playbackQueue.slice(queueIndex + 1, queueIndex + 5)) {
      if (!song || seen.has(song.id)) continue;
      seen.add(song.id);
      deduped.push(song);
    }
    return deduped;
  }, [currentSong, playbackQueue, queueIndex]);

  const fallbackRelatedSongs = useMemo(() => {
    if (!currentSong) return [];
    const deduped: typeof recentSongs = [];
    const seen = new Set<string>([currentSong.id]);
    for (const song of recentSongs) {
      if (!song || seen.has(song.id)) continue;
      seen.add(song.id);
      deduped.push(song);
      if (deduped.length >= 4) break;
    }
    return deduped;
  }, [currentSong, recentSongs]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeFullscreen]);

  useEffect(() => {
    if (!currentSong?.coverUrl) return;

    let isCancelled = false;
    const image = new window.Image();
    image.crossOrigin = "anonymous";

    image.onload = () => {
      if (isCancelled) return;

      try {
        setRelatedPalette(extractPaletteFromImage(image));
      } catch {
        setRelatedPalette(DEFAULT_PALETTE);
      }
    };

    image.onerror = () => {
      if (isCancelled) return;
      setRelatedPalette(DEFAULT_PALETTE);
    };

    image.src = currentSong.coverUrl;

    return () => {
      isCancelled = true;
    };
  }, [currentSong?.coverUrl]);

  useEffect(() => {
    let cancelled = false;

    const loadLyrics = async () => {
      if (!currentSong) {
        setLyricsText("");
        setLyricsState({
          loading: false,
          error: null,
          isSynced: false,
        });
        return;
      }

      setLyricsState((previous) => ({
        loading: true,
        error: null,
        isSynced: previous.isSynced,
      }));

      try {
        const payload = await fetchLyrics({
          id: currentSong.id,
          title: currentSong.title,
          artist: currentSong.artist,
          duration: currentSong.duration,
        });

        if (cancelled) return;

        if (!payload?.lyrics) {
          setLyricsText("");
          setLyricsState({
            loading: false,
            error: "Lyrics are not available for this track right now.",
            isSynced: false,
          });
          return;
        }

        setLyricsText(payload.lyrics);
        setLyricsState({
          loading: false,
          error: null,
          isSynced: Boolean(payload.isSynced),
        });
      } catch {
        if (cancelled) return;
        setLyricsText("");
        setLyricsState({
          loading: false,
          error: "Couldn't load lyrics for this track.",
          isSynced: false,
        });
      }
    };

    loadLyrics();

    return () => {
      cancelled = true;
    };
  }, [
    currentSong,
    currentSong?.id,
    currentSong?.title,
    currentSong?.artist,
    currentSong?.duration,
  ]);

  useEffect(() => {
    if (!currentSong) {
      setManualLyricsArtist("");
      setManualLyricsTitle("");
      return;
    }

    setManualLyricsArtist(currentSong.artist || "");
    setManualLyricsTitle(currentSong.title || "");
  }, [currentSong]);

  const lyricLines = useMemo<TimedLyricLine[]>(
    () => (lyricsState.isSynced ? buildTimedLyrics(lyricsText) : []),
    [lyricsText, lyricsState.isSynced]
  );

  const plainLyricsText = useMemo(() => lyricsText.trim(), [lyricsText]);
  const sectionSongs =
    upNextSongs.length > 0 ? upNextSongs : fallbackRelatedSongs;
  const sectionTitle = upNextSongs.length > 0 ? "Up Next" : "Related";

  const activeLyricIndex = useMemo(
    () => findActiveLyricIndex(lyricLines, currentTime),
    [lyricLines, currentTime]
  );
  const isLyricsManualMode = lyricsManualModeUntil > Date.now();

  useEffect(() => {
    if (!lyricsManualModeUntil) return;

    const remainingMs = lyricsManualModeUntil - Date.now();
    if (remainingMs <= 0) {
      setLyricsManualModeUntil(0);
      return;
    }

    const timer = window.setTimeout(() => {
      setLyricsManualModeUntil(0);
    }, remainingMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [lyricsManualModeUntil]);

  useEffect(() => {
    setLyricsManualModeUntil(0);
  }, [currentSong?.id]);

  useEffect(() => {
    return () => {
      if (lyricsScrollReleaseTimerRef.current !== null) {
        window.clearTimeout(lyricsScrollReleaseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!lyricsState.isSynced) return;
    if (activeLyricIndex < 0) return;
    if (isLyricsManualMode) return;

    const container = lyricsContainerRef.current;
    const activeElement = lyricItemRefs.current[activeLyricIndex];
    if (!container || !activeElement) return;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeElement.getBoundingClientRect();
    const targetScrollTop =
      container.scrollTop +
      (activeRect.top - containerRect.top) -
      container.clientHeight / 2 +
      activeElement.clientHeight / 2;

    isProgrammaticLyricsScrollRef.current = true;
    if (lyricsScrollReleaseTimerRef.current !== null) {
      window.clearTimeout(lyricsScrollReleaseTimerRef.current);
    }
    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: "smooth",
    });
    lyricsScrollReleaseTimerRef.current = window.setTimeout(() => {
      isProgrammaticLyricsScrollRef.current = false;
    }, 500);
  }, [activeLyricIndex, isLyricsManualMode, lyricsState.isSynced]);

  const markLyricsUserScrollIntent = () => {
    lyricsUserScrollIntentUntilRef.current =
      Date.now() + LYRICS_USER_SCROLL_INTENT_MS;
  };

  const handleLyricsContainerScroll = () => {
    if (isProgrammaticLyricsScrollRef.current) return;
    if (lyricsUserScrollIntentUntilRef.current < Date.now()) return;
    setLyricsManualModeUntil(Date.now() + LYRICS_MANUAL_SCROLL_HOLD_MS);
  };

  if (!currentSong) {
    return null;
  }

  const songMeta = [
    currentSong.artist,
    currentSong.uploaded,
    formatTime(duration || currentSong.duration || 0),
  ]
    .filter(Boolean)
    .join(" • ");
  const displayPalette = currentSong.coverUrl
    ? relatedPalette
    : DEFAULT_PALETTE;

  const runManualLyricsSearch = async () => {
    if (!currentSong) return;

    const nextArtist = manualLyricsArtist.trim() || currentSong.artist || "";
    const nextTitle = manualLyricsTitle.trim() || currentSong.title || "";

    setLyricsState({
      loading: true,
      error: null,
      isSynced: false,
    });

    try {
      const payload = await fetchLyrics({
        id: currentSong.id,
        title: nextTitle,
        artist: nextArtist,
        duration: currentSong.duration,
      });

      if (!payload?.lyrics) {
        setLyricsText("");
        setLyricsState({
          loading: false,
          error: "No lyrics found. Try another artist or song title.",
          isSynced: false,
        });
        return;
      }

      setLyricsText(payload.lyrics);
      setLyricsState({
        loading: false,
        error: null,
        isSynced: Boolean(payload.isSynced),
      });
    } catch {
      setLyricsText("");
      setLyricsState({
        loading: false,
        error: "Couldn't load lyrics for that search. Try another spelling.",
        isSynced: false,
      });
    }
  };

  const handleSectionSongPress = (
    song: (typeof sectionSongs)[number],
    index: number
  ) => {
    if (upNextSongs.length > 0) {
      playQueueIndex(queueIndex + index + 1);
      return;
    }

    const relatedQueue = [currentSong, ...fallbackRelatedSongs];
    void resolveAndPlaySong(song, {
      queue: relatedQueue,
      currentIndex: index + 1,
    }).catch((error) => {
      console.error("Failed to play related song:", error);
    });
  };

  return (
    <div className="h-full overflow-hidden rounded-xl">
      <div className="grid h-full w-full gap-2 bg-[#070707] lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)]">
        <section className="relative min-h-[320px] overflow-hidden rounded-xl bg-[#8a1207]">
          {currentSong.coverUrl ? (
            <>
              <Image
                src={currentSong.coverUrl}
                alt={currentSong.title}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 60vw"
                unoptimized
              />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_35%)]" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#c01c0c] to-[#250707]" />
          )}

          <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={closeFullscreen}
              className="inline-flex items-center gap-2 rounded-full bg-black/25 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition hover:bg-black/35"
            >
              Minimize
              <ChevronDownGlyph />
            </button>
            <div className="inline-flex items-center gap-2 rounded-full bg-black/25 px-4 py-2 text-sm font-medium text-white backdrop-blur-md">
              Full Screen
              <ExpandGlyph />
            </div>
          </div>

          <div className="absolute bottom-2 left-2 right-2 rounded-xl bg-black/25 px-6 py-5 backdrop-blur-xl md:px-7">
            <p className="text-sm text-white/70">Song</p>
            <h2 className="mt-1 text-2xl font-semibold text-white md:text-3xl">
              {currentSong.title}
            </h2>
            {songMeta ? (
              <p className="mt-2 text-sm text-white/75 md:text-base">
                {songMeta}
              </p>
            ) : null}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-2">
          <section className="flex min-h-0 flex-1 flex-col rounded-xl bg-[#181818] px-3 py-3 md:px-4 md:py-4">
            <div className="flex min-h-0 flex-1 flex-col rounded-[24px]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="mt-1 truncate text-lg font-semibold text-white">
                    {currentSong.title}
                  </p>
                  <p className="text-sm text-white/55">Lyrics</p>
                </div>
                <button
                  type="button"
                  onClick={closeFullscreen}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl leading-none text-white/70 transition hover:bg-white/8 hover:text-white"
                  aria-label="Close fullscreen player"
                >
                  ×
                </button>
              </div>
              <div
                ref={lyricsContainerRef}
                onWheel={markLyricsUserScrollIntent}
                onTouchStart={markLyricsUserScrollIntent}
                onScroll={handleLyricsContainerScroll}
                className="mt-5 flex-1 overflow-y-auto hide-scrollbar pr-1 text-white/90"
              >
                <div className="space-y-2 text-lg leading-9 md:text-[22px] md:leading-[1.5]">
                  {lyricsState.loading ? (
                    <div className="space-y-3 py-2">
                      <p className="text-white/45">Loading lyrics...</p>
                    </div>
                  ) : lyricLines.length > 0 ? (
                    <>
                      {lyricLines.map((line, index) => {
                        const isActive = index === activeLyricIndex;
                        const isPassed = activeLyricIndex > index;
                        return (
                          <button
                            key={`${line.startTime}-${line.text}-${index}`}
                            ref={(element) => {
                              lyricItemRefs.current[index] = element;
                            }}
                            type="button"
                            onClick={() => {
                              setLyricsManualModeUntil(0);
                              seekTo(line.startTime);
                            }}
                            className={`block w-full rounded-xl px-2 py-1 text-left transition ${
                              isActive
                                ? "bg-white/8 font-semibold text-white"
                                : isLyricsManualMode
                                ? "text-white hover:bg-white/5"
                                : isPassed
                                ? "text-white/45"
                                : "text-white/72 hover:bg-white/5 hover:text-white"
                            }`}
                            title={`Jump to ${formatTime(line.startTime)}`}
                          >
                            {line.text}
                          </button>
                        );
                      })}
                    </>
                  ) : plainLyricsText ? (
                    <>
                      <p className="pb-3 text-sm text-white/40">
                        Synced lyrics were not available for this track.
                      </p>
                      <pre className="whitespace-pre-wrap font-sans text-lg leading-9 text-white md:text-[22px] md:leading-[1.5]">
                        {plainLyricsText}
                      </pre>
                    </>
                  ) : (
                    <div className="space-y-3 py-2">
                      <p className="font-medium text-white/55">
                        {lyricsState.error ||
                          "Lyrics are not available for this track yet."}
                      </p>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-sm text-white/70">
                          Search manually for lyrics
                        </p>
                        <div className="mt-3 grid gap-3">
                          <input
                            type="text"
                            value={manualLyricsArtist}
                            onChange={(event) =>
                              setManualLyricsArtist(event.target.value)
                            }
                            placeholder="Artist name"
                            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-white/25"
                          />
                          <input
                            type="text"
                            value={manualLyricsTitle}
                            onChange={(event) =>
                              setManualLyricsTitle(event.target.value)
                            }
                            placeholder="Song title"
                            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-white/25"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              void runManualLyricsSearch();
                            }}
                            disabled={
                              lyricsState.loading ||
                              (!manualLyricsArtist.trim() &&
                                !manualLyricsTitle.trim())
                            }
                            className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                          >
                            Try Lyrics Search
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section
            className="flex max-h-[230px] min-h-0 flex-col overflow-hidden rounded-xl px-3 py-3 md:max-h-[250px] md:px-4 md:py-4"
            style={{
              backgroundImage: `linear-gradient(180deg, ${rgbToCss(
                displayPalette.primary,
                0.88
              )} 0%, ${rgbToCss(
                displayPalette.secondary,
                0.76
              )} 58%, rgba(24, 24, 24, 0.96) 100%)`,
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-white/55">{sectionTitle}</p>
              </div>
            </div>

            {sectionSongs.length > 0 ? (
              <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto hide-scrollbar pr-1">
                {sectionSongs.map((song, index) => (
                  <button
                    key={`${sectionTitle}-${song.id}-${index}`}
                    type="button"
                    onClick={() => handleSectionSongPress(song, index)}
                    className="flex w-full items-center gap-2.5 rounded-xl bg-black/10 px-2.5 py-1.5 text-left transition hover:bg-black/20"
                    title={song.title}
                  >
                    <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-md">
                      {song.coverUrl ? (
                        <Image
                          src={song.coverUrl}
                          alt={song.title}
                          fill
                          className="rounded-md object-cover"
                          sizes="44px"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-zinc-800">
                          <Image
                            src="/StreamifyLogo.svg"
                            alt="Default cover"
                            width={24}
                            height={24}
                            className="opacity-45"
                          />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium leading-5 text-white">
                        {song.title}
                      </p>
                      <p className="truncate text-[11px] text-white/60">
                        {song.artist}
                      </p>
                    </div>
                    {upNextSongs.length > 0 ? (
                      <span className="text-xs text-white/45">
                        {queueIndex + index + 2}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl bg-white/5 px-4 py-6 text-sm text-white/55">
                Play a few more songs and related tracks will show up here.
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
