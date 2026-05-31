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
    currentTime,
    duration,
    seekTo,
    closeFullscreen,
    playSong,
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
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const lyricItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const relatedSongs = useMemo(() => {
    if (!currentSong) return [];
    return recentSongs.filter((song) => song.id !== currentSong.id).slice(0, 4);
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

  const lyricLines = useMemo<TimedLyricLine[]>(
    () => (lyricsState.isSynced ? buildTimedLyrics(lyricsText) : []),
    [lyricsText, lyricsState.isSynced]
  );

  const plainLyricsText = useMemo(() => lyricsText.trim(), [lyricsText]);

  const activeLyricIndex = useMemo(
    () => findActiveLyricIndex(lyricLines, currentTime),
    [lyricLines, currentTime]
  );

  useEffect(() => {
    if (!lyricsState.isSynced) return;
    if (activeLyricIndex < 0) return;

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

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: "smooth",
    });
  }, [activeLyricIndex, lyricsState.isSynced]);

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

  return (
    <div className="h-full overflow-hidden  bg-[#070707] shadow-[0_30px_120px_rgba(0,0,0,0.65)]">
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
              className="rounded-full bg-black/25 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition hover:bg-black/35"
            >
              Minimize
            </button>
            <div className="rounded-full bg-black/25 px-4 py-2 text-sm font-medium text-white backdrop-blur-md">
              Full Screen
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
                className="mt-5 flex-1 overflow-y-auto hide-scrollbar pr-1 text-white/90"
              >
                <div className="space-y-2 text-lg leading-9 md:text-[22px] md:leading-[1.5]">
                  {lyricsState.loading ? (
                    <div className="space-y-3 py-2">
                      <p className="text-white/45">Loading lyrics...</p>
                      <p className="text-white/25">Synced Lyrics Loading...</p>
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
                            onClick={() => seekTo(line.startTime)}
                            className={`block w-full rounded-xl px-2 py-1 text-left transition ${
                              isActive
                                ? "bg-white/8 font-semibold text-white"
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
                      <pre className="whitespace-pre-wrap font-sans text-lg leading-9 text-white/72 md:text-[22px] md:leading-[1.5]">
                        {plainLyricsText}
                      </pre>
                    </>
                  ) : (
                    <div className="space-y-3 py-2">
                      <p className="font-medium text-white/55">
                        {lyricsState.error ||
                          "Lyrics are not available for this track yet."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section
            className="rounded-xl px-3 py-3 md:px-4 md:py-4"
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
                <p className="text-sm text-white/55">Related Music Videos</p>
              </div>
              <button
                type="button"
                className="text-sm text-white/60 transition hover:text-white"
              >
                See All
              </button>
            </div>

            {relatedSongs.length > 0 ? (
              <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
                {relatedSongs.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => playSong(song)}
                    className="text-left transition"
                    title={song.title}
                  >
                    <div className="relative rounded-md aspect-[1]">
                      {song.coverUrl ? (
                        <Image
                          src={song.coverUrl}
                          alt={song.title}
                          fill
                          className="object-cover rounded-lg"
                          sizes="(max-width: 1024px) 40vw, 18vw"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-zinc-800">
                          <Image
                            src="/StreamifyLogo.svg"
                            alt="Default cover"
                            width={36}
                            height={36}
                            className="opacity-45"
                          />
                        </div>
                      )}
                    </div>
                    <div className="text-center px-3 pb-3 pt-2">
                      <p className="truncate text-sm font-medium text-white">
                        {song.title}
                      </p>
                      <p className="mt-1 truncate text-xs text-white/60">
                        {song.artist}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl bg-white/5 px-4 py-6 text-sm text-white/55">
                Play a few songs and related videos will show up here.
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
