"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { useAudio } from "../contexts/AudioContext";
import { spaceMono } from "../fonts";

const STATIC_WAVEFORM_BAR_COUNT = 56;

function createStaticWaveform(seedInput: string, count: number): number[] {
  let seed = 0;

  for (let index = 0; index < seedInput.length; index += 1) {
    seed = (seed * 31 + seedInput.charCodeAt(index)) >>> 0;
  }

  let state = seed || 1;
  const values: number[] = [];

  for (let index = 0; index < count; index += 1) {
    state = (1664525 * state + 1013904223) >>> 0;
    const random = state / 0xffffffff;
    const prev = values[index - 1] ?? 0.55;
    const next = Math.min(0.92, Math.max(0.24, prev * 0.45 + random * 0.55));
    values.push(next);
  }

  return values;
}

const MiniPlayer: React.FC = () => {
  const {
    currentSong,
    isPlaying,
    isSongLoading,
    playbackError,
    currentTime,
    duration,
    volume,
    isRepeat,
    pauseSong,
    resumeSong,
    seekTo,
    setVolume,
    toggleRepeat,
    playNext,
    playPrevious,
    isFullscreenOpen,
    openFullscreen,
    closeFullscreen,
  } = useAudio();

  const compactWaveformRef = useRef<HTMLButtonElement>(null);
  const volumeControlRef = useRef<HTMLDivElement>(null);
  const isDraggingSeekRef = useRef(false);
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);

  const waveformBars = useMemo(() => {
    if (!currentSong) return [];

    return createStaticWaveform(
      `${currentSong.id}:${currentSong.title}:${
        currentSong.duration ?? duration ?? 0
      }`,
      STATIC_WAVEFORM_BAR_COUNT
    );
  }, [currentSong, duration]);

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      pauseSong();
    } else {
      resumeSong();
    }
  };

  const handleFullscreenToggle = () => {
    if (isFullscreenOpen) {
      closeFullscreen();
      return;
    }

    openFullscreen();
  };

  const progress =
    duration > 0 ? Math.min(Math.max(currentTime / duration, 0), 1) : 0;
  const progressPercent = progress * 100;
  const playedBars = Math.round(progress * waveformBars.length);
  const volumePercent = Math.round(volume * 100);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      if (!duration) return;

      const bounds = compactWaveformRef.current?.getBoundingClientRect();
      if (!bounds) return;

      const ratio = Math.min(
        Math.max((clientX - bounds.left) / bounds.width, 0),
        1
      );
      seekTo(duration * ratio);
    },
    [duration, seekTo]
  );

  useEffect(() => {
    return () => {
      isDraggingSeekRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isVolumeOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!volumeControlRef.current?.contains(event.target as Node)) {
        setIsVolumeOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsVolumeOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isVolumeOpen]);

  const handleCompactWaveformPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (!duration) return;

    isDraggingSeekRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromClientX(event.clientX);
  };

  const handleCompactWaveformPointerMove = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (!isDraggingSeekRef.current) return;
    seekFromClientX(event.clientX);
  };

  const handleCompactWaveformPointerEnd = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (!isDraggingSeekRef.current) return;

    seekFromClientX(event.clientX);
    isDraggingSeekRef.current = false;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  if (!currentSong) {
    return null;
  }

  const statusText = isSongLoading
    ? "Loading track..."
    : playbackError
    ? playbackError
    : null;

  return (
    <div className="fixed bottom-3 left-3 right-3 z-50 rounded-full bg-[#181818] p-3">
      <div className="mx-auto flex max-w-full items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center space-x-3">
          <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-gray-700">
            {currentSong.coverUrl ? (
              <Image
                src={currentSong.coverUrl}
                alt={currentSong.title}
                fill
                style={{ objectFit: "cover" }}
                sizes="48px"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gray-600">
                <Image
                  src="/StreamifyLogo.svg"
                  alt="Default cover"
                  width={24}
                  height={24}
                  className="opacity-50"
                />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h4 className="truncate text-sm font-medium text-white">
              {currentSong.title}
            </h4>
            <p
              className={`truncate text-xs ${
                statusText
                  ? isSongLoading
                    ? "text-gray-400"
                    : "text-red-300"
                  : "text-gray-400"
              }`}
            >
              {statusText || currentSong.artist}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center space-x-3 px-4">
          <button
            ref={compactWaveformRef}
            type="button"
            onPointerDown={handleCompactWaveformPointerDown}
            onPointerMove={handleCompactWaveformPointerMove}
            onPointerUp={handleCompactWaveformPointerEnd}
            onPointerCancel={handleCompactWaveformPointerEnd}
            className="relative h-8 flex-1 min-w-[180px] max-w-[240px] cursor-ew-resize overflow-hidden touch-none"
            aria-label="Seek playback"
          >
            <div className="absolute inset-0 flex items-center gap-[2px]">
              {waveformBars.map((height, index) => (
                <span
                  key={`${currentSong.id}-${index}`}
                  className="w-full rounded-full transition-colors duration-150"
                  style={{
                    height: `${Math.max(18, Math.round(height * 100))}%`,
                    backgroundColor:
                      index < playedBars
                        ? "rgba(255, 255, 255, 1)"
                        : "rgba(255, 255, 255, 0.45)",
                  }}
                />
              ))}
            </div>
            <div
              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white/90"
              style={{
                left:
                  progressPercent <= 0
                    ? "0px"
                    : `calc(${progressPercent}% - 0.5px)`,
              }}
            />
          </button>
          <div
            className={`${spaceMono.className} whitespace-nowrap text-xs tabular-nums`}
          >
            <span className="text-white">{formatTime(currentTime)}</span>
            <span className="text-white/50">
              {" "}
              / {formatTime(duration || 0)}
            </span>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end space-x-2">
          <button
            type="button"
            onClick={playPrevious}
            className="rounded-full transition-colors"
          >
            <Image src="/Previous.svg" alt="Previous" width={42} height={42} />
          </button>

          <button
            type="button"
            disabled={isSongLoading}
            onClick={handlePlayPause}
            className="flex h-10 w-10 items-center justify-center transition-colors"
          >
            {isSongLoading ? (
              <div className="h-5 w-5 rounded-full border-2 border-white/80 border-t-transparent animate-spin" />
            ) : isPlaying ? (
              <Image src="/Pause.svg" alt="Pause" width={32} height={32} />
            ) : (
              <Image src="/Play.svg" alt="Play" width={32} height={32} />
            )}
          </button>

          <button
            type="button"
            onClick={playNext}
            className="rounded-full transition-colors"
          >
            <Image src="/Next.svg" alt="Next" width={42} height={42} />
          </button>

          <button
            type="button"
            onClick={toggleRepeat}
            className={`rounded-full transition-colors ${
              isRepeat ? "opacity-100" : "opacity-70"
            }`}
          >
            <Image src="/Repeat.svg" alt="Repeat" width={42} height={42} />
          </button>

          <div
            ref={volumeControlRef}
            className="relative flex items-center pr-2"
          >
            {isVolumeOpen ? (
              <div className="absolute bottom-full right-1 mb-3 rounded-full bg-[#202020] px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volumePercent}
                  onChange={(event) =>
                    setVolume(Number(event.target.value) / 100)
                  }
                  className="volume-slider h-4 w-20 cursor-pointer appearance-none bg-transparent"
                  style={
                    {
                      "--volume-progress": `${volumePercent}%`,
                    } as React.CSSProperties
                  }
                  aria-label="Adjust volume"
                />
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setIsVolumeOpen((prev) => !prev)}
              className="rounded-full transition-colors"
              aria-label="Toggle volume slider"
              aria-expanded={isVolumeOpen}
            >
              <Image src="/Volume.svg" alt="Volume" width={42} height={42} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleFullscreenToggle}
            className="rounded-full pr-2 transition-colors"
            aria-label={
              isFullscreenOpen
                ? "Close fullscreen player"
                : "Open fullscreen player"
            }
          >
            <Image
              src="/Fullscreen.svg"
              alt="Fullscreen"
              width={16}
              height={16}
            />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MiniPlayer;
