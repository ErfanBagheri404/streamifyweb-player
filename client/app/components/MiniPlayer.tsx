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
import { useAppLanguage } from "../hooks/useAppLanguage";
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
  const { t, isRtl, formatNumber } = useAppLanguage();
  const {
    currentSong,
    recentSongs,
    playbackQueue,
    queueIndex,
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
    showAutoRetryPrompt,
    autoRetryStatusMessage,
    enableAutoRetry,
    disableAutoRetry,
  } = useAudio();

  const compactWaveformRef = useRef<HTMLButtonElement>(null);
  const volumeControlRef = useRef<HTMLDivElement>(null);
  const lastNonZeroVolumeRef = useRef(0.8);
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
  const isMuted = volumePercent === 0;
  const volumeLabel = isMuted
    ? t("miniPlayer.volumeMuted")
    : volumePercent < 35
    ? t("miniPlayer.volumeLow")
    : volumePercent < 70
    ? t("miniPlayer.volumeMedium")
    : t("miniPlayer.volumeHigh");
  const canGoPrevious =
    currentTime > 3 || queueIndex > 0 || recentSongs.length > 1;
  const canGoNext = queueIndex >= 0 && queueIndex < playbackQueue.length - 1;
  const queuePositionLabel =
    playbackQueue.length > 1 && queueIndex >= 0
      ? t("miniPlayer.queuePosition", {
          current: formatNumber(queueIndex + 1),
          total: formatNumber(playbackQueue.length),
        })
      : null;
  const toggleMute = () => {
    if (isMuted) {
      setVolume(lastNonZeroVolumeRef.current || 0.8);
      return;
    }

    setVolume(0);
  };

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
    if (volume > 0) {
      lastNonZeroVolumeRef.current = volume;
    }
  }, [volume]);

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
    ? t("common.loadingTrack")
    : playbackError
    ? playbackError
    : null;

  return (
    <div
      dir="ltr"
      className={`fixed bottom-[calc(4.6rem+env(safe-area-inset-bottom))] left-1.5 right-1.5 z-50 sm:bottom-[calc(4.85rem+env(safe-area-inset-bottom))] lg:bottom-3 lg:left-3 lg:right-3 ${
        isFullscreenOpen ? "hidden lg:block" : ""
      }`}
    >
      <div
        className={`pointer-events-none absolute bottom-full left-1/2 mb-3 flex -translate-x-1/2 transition-all duration-200 ${
          showAutoRetryPrompt || autoRetryStatusMessage
            ? "translate-y-0 opacity-100"
            : "translate-y-2 opacity-0"
        }`}
      >
        {showAutoRetryPrompt ? (
          <div className="theme-surface pointer-events-auto w-[min(92vw,420px)] rounded-[28px] border p-4 text-white shadow-[0_22px_55px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              {t("miniPlayer.playbackHelp")}
            </p>
            <p className="mt-2 text-sm font-medium text-white">
              {t("miniPlayer.enableAutoRetryQuestion")}
            </p>
            <p className="mt-1 text-sm text-white/60">
              {t("miniPlayer.enableAutoRetryDescription")}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={disableAutoRetry}
                className="rounded-full px-4 py-2 text-sm font-semibold text-white/65 transition hover:text-white"
              >
                {t("miniPlayer.noThanks")}
              </button>
              <button
                type="button"
                onClick={enableAutoRetry}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:scale-[1.02]"
              >
                {t("miniPlayer.enableAutoRetry")}
              </button>
            </div>
          </div>
        ) : autoRetryStatusMessage ? (
          <div className="theme-overlay pointer-events-auto rounded-full border px-4 py-2 text-sm font-medium text-white shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            {autoRetryStatusMessage}
          </div>
        ) : null}
      </div>

      <div className="theme-surface rounded-[24px] border px-3 py-2 shadow-[0_20px_50px_rgba(0,0,0,0.35)] lg:rounded-full lg:p-2">
        <div className="mx-auto flex max-w-full flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center space-x-2.5 lg:flex-1 lg:space-x-3">
            <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-gray-700 transition lg:h-12 lg:w-12">
              {currentSong.coverUrl ? (
                <Image
                  src={currentSong.coverUrl}
                  alt={currentSong.title}
                  fill
                  style={{ objectFit: "cover" }}
                  sizes="(max-width: 1024px) 40px, 48px"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gray-600">
                  <Image
                    src="/StreamifyLogo.svg"
                    alt={t("common.defaultCover")}
                    width={20}
                    height={20}
                    className="opacity-50"
                  />
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <h4 className="truncate text-[13px] font-medium text-white lg:text-sm">
                {currentSong.title}
              </h4>
              <p
                className={`truncate text-[11px] lg:text-xs ${
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

          <div className="flex min-w-0 items-center justify-between gap-2.5 lg:flex-1 lg:justify-center lg:px-4">
            <button
              ref={compactWaveformRef}
              type="button"
              onPointerDown={handleCompactWaveformPointerDown}
              onPointerMove={handleCompactWaveformPointerMove}
              onPointerUp={handleCompactWaveformPointerEnd}
              onPointerCancel={handleCompactWaveformPointerEnd}
              className="relative h-7 min-w-0 flex-1 cursor-ew-resize overflow-hidden touch-none lg:h-8 lg:min-w-[180px] lg:max-w-[240px]"
              aria-label={t("miniPlayer.seekPlayback")}
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
              className={`${spaceMono.className} whitespace-nowrap text-[11px] tabular-nums lg:text-xs`}
            >
              <span className="text-white">{formatTime(currentTime)}</span>
              <span className="text-white/50">
                {" "}
                / {formatTime(duration || 0)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-1.5 lg:flex-1 lg:justify-end lg:gap-2">
            {queuePositionLabel ? (
              <span
                dir={isRtl ? "rtl" : "ltr"}
                className={`theme-surface-soft hidden rounded-full border px-3 py-1 text-[11px] font-medium text-white/55 xl:inline-flex ${
                  isRtl ? "" : "uppercase tracking-[0.18em]"
                }`}
                style={{ unicodeBidi: "plaintext" }}
              >
                {t("miniPlayer.queue", { position: queuePositionLabel || "" })}
              </span>
            ) : null}
            <button
              type="button"
              onClick={playPrevious}
              disabled={!canGoPrevious}
              className="flex h-10 w-10 items-center justify-center rounded-full transition duration-150 hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100 lg:h-auto lg:w-auto"
              aria-label={t("miniPlayer.previousTrack")}
            >
              <Image
                src="/Previous.svg"
                alt={t("miniPlayer.previousTrack")}
                width={34}
                height={34}
                className="h-[34px] w-[34px] lg:h-[42px] lg:w-[42px]"
              />
            </button>

            <button
              type="button"
              disabled={isSongLoading}
              onClick={handlePlayPause}
              className="flex h-10 w-10 items-center justify-center transition duration-150 hover:scale-[1.03] disabled:hover:scale-100 lg:h-10 lg:w-10"
            >
              {isSongLoading ? (
                <div className="theme-spinner h-5 w-5" />
              ) : isPlaying ? (
                <Image
                  src="/Pause.svg"
                  alt="Pause"
                  width={28}
                  height={28}
                  className="h-8 w-8 lg:h-8 lg:w-8"
                />
              ) : (
                <Image
                  src="/Play.svg"
                  alt="Play"
                  width={28}
                  height={28}
                  className="h-8 w-8 lg:h-8 lg:w-8"
                />
              )}
            </button>

            <button
              type="button"
              onClick={playNext}
              disabled={!canGoNext}
              className="flex h-10 w-10 items-center justify-center rounded-full transition duration-150 hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100 lg:h-auto lg:w-auto"
              aria-label={t("miniPlayer.nextTrack")}
            >
              <Image
                src="/Next.svg"
                alt={t("miniPlayer.nextTrack")}
                width={34}
                height={34}
                className="h-[34px] w-[34px] lg:h-[42px] lg:w-[42px]"
              />
            </button>

            <button
              type="button"
              onClick={toggleRepeat}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors lg:h-auto lg:w-auto ${
                isRepeat ? "opacity-100" : "opacity-70"
              }`}
            >
              <Image
                src="/Repeat.svg"
                alt="Repeat"
                width={34}
                height={34}
                className="h-[34px] w-[34px] lg:h-[42px] lg:w-[42px]"
              />
            </button>

            <div
              ref={volumeControlRef}
              className="relative flex items-center lg:pr-2"
            >
              {isVolumeOpen ? (
                <div className="theme-overlay absolute bottom-full right-0 mb-3 w-[min(85vw,220px)] rounded-2xl border px-4 py-4 shadow-[0_16px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl lg:right-1 lg:w-[220px]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                        {t("miniPlayer.volume")}
                      </p>
                      <p className="mt-1 text-sm font-medium text-white">
                        {volumeLabel} · {volumePercent}%
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="theme-button-soft rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                    >
                      {isMuted ? t("miniPlayer.unmute") : t("miniPlayer.mute")}
                    </button>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="text-xs text-white/40">0</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={volumePercent}
                      onChange={(event) =>
                        setVolume(Number(event.target.value) / 100)
                      }
                      className="volume-slider h-6 w-full cursor-pointer appearance-none bg-transparent"
                      style={
                        {
                          "--volume-progress": `${volumePercent}%`,
                        } as React.CSSProperties
                      }
                      aria-label={t("miniPlayer.adjustVolume")}
                    />
                    <span className="text-xs text-white/40">100</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {[25, 60, 100].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setVolume(preset / 100)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                          volumePercent === preset
                            ? "theme-button-accent border-transparent"
                            : "theme-button-soft"
                        }`}
                      >
                        {preset}%
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setIsVolumeOpen((prev) => !prev)}
                className="theme-button-soft flex h-10 w-10 items-center justify-center rounded-full border transition duration-150 hover:scale-[1.03] lg:h-10 lg:w-10"
                aria-label={t("miniPlayer.toggleVolume")}
                aria-expanded={isVolumeOpen}
              >
                <Image
                  src="/Volume.svg"
                  alt={t("miniPlayer.volume")}
                  width={34}
                  height={34}
                  className="h-[34px] w-[34px] lg:h-[42px] lg:w-[42px]"
                />
              </button>
            </div>

            <button
              type="button"
              onClick={handleFullscreenToggle}
              className="rounded-full transition duration-150 hover:scale-[1.03] lg:pr-2"
              aria-label={
                isFullscreenOpen
                  ? t("miniPlayer.closeFullscreen")
                  : t("miniPlayer.openFullscreen")
              }
            >
              <Image
                src="/Fullscreen.svg"
                alt={
                  isFullscreenOpen
                    ? t("miniPlayer.closeFullscreen")
                    : t("miniPlayer.openFullscreen")
                }
                width={16}
                height={16}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MiniPlayer;
