"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAudio } from "../contexts/AudioContext";
import { useAppLanguage } from "../hooks/useAppLanguage";
import { useSidePanel } from "../contexts/SidePanelContext";
import { spaceMono } from "../fonts";
import { isStandaloneAuthPath } from "../lib/auth-routes";

const STATIC_WAVEFORM_BAR_COUNT = 56;

function PlayControlIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M8.75 6.6c0-1.01 1.11-1.63 1.98-1.1l7.61 4.65a1.3 1.3 0 0 1 0 2.2l-7.61 4.65c-.87.53-1.98-.09-1.98-1.1V6.6Z" />
    </svg>
  );
}

function PauseControlIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M7.75 5.5A1.25 1.25 0 0 1 9 6.75v10.5a1.25 1.25 0 1 1-2.5 0V6.75A1.25 1.25 0 0 1 7.75 5.5Zm8.5 0a1.25 1.25 0 0 1 1.25 1.25v10.5a1.25 1.25 0 1 1-2.5 0V6.75a1.25 1.25 0 0 1 1.25-1.25Z" />
    </svg>
  );
}

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
  const pathname = usePathname();
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
    repeatMode,
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
  const { isOpen: isSidePanelOpen, setIsOpen: setSidePanelOpen } =
    useSidePanel();
  const isAuthPage = isStandaloneAuthPath(pathname);

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
  const repeatModeLabel =
    repeatMode === "queue"
      ? t("miniPlayer.repeatQueue")
      : repeatMode === "one"
      ? t("miniPlayer.repeatOne")
      : t("miniPlayer.repeatOff");
  const repeatBadgeLabel =
    repeatMode === "queue"
      ? t("miniPlayer.repeatAllShort")
      : repeatMode === "one"
      ? t("miniPlayer.repeatOneShort")
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

  if (!currentSong || isAuthPage) {
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
          <div className="theme-surface theme-shadow-strong pointer-events-auto w-[min(92vw,420px)] rounded-[28px] border p-4 text-[color:var(--foreground)] backdrop-blur-2xl">
            <p className="theme-muted text-xs font-semibold uppercase tracking-[0.18em]">
              {t("miniPlayer.playbackHelp")}
            </p>
            <p className="mt-2 text-sm font-medium text-[color:var(--foreground)]">
              {t("miniPlayer.enableAutoRetryQuestion")}
            </p>
            <p className="theme-muted mt-1 text-sm">
              {t("miniPlayer.enableAutoRetryDescription")}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={disableAutoRetry}
                className="theme-muted rounded-full px-4 py-2 text-sm font-semibold transition hover:text-[color:var(--foreground)]"
              >
                {t("miniPlayer.noThanks")}
              </button>
              <button
                type="button"
                onClick={enableAutoRetry}
                className="theme-button-solid rounded-full px-4 py-2 text-sm font-semibold transition hover:scale-[1.02]"
              >
                {t("miniPlayer.enableAutoRetry")}
              </button>
            </div>
          </div>
        ) : autoRetryStatusMessage ? (
          <div className="theme-overlay theme-shadow-floating pointer-events-auto rounded-full border px-4 py-2 text-sm font-medium text-[color:var(--foreground)] backdrop-blur-xl">
            {autoRetryStatusMessage}
          </div>
        ) : null}
      </div>

      <div className="theme-surface theme-shadow-strong rounded-[24px] border px-3 py-2 lg:rounded-full lg:p-2">
        <div className="mx-auto flex max-w-full flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center space-x-2.5 lg:flex-1 lg:space-x-3">
            <div className="theme-surface-soft relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full border transition lg:h-12 lg:w-12">
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
                <div className="theme-surface-soft flex h-full w-full items-center justify-center">
                  <Image
                    src="/StreamifyLogo.svg"
                    alt={t("common.defaultCover")}
                    width={20}
                    height={20}
                    className="theme-asset-icon opacity-50"
                  />
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <h4 className="truncate text-[13px] font-medium text-[color:var(--foreground)] lg:text-sm">
                {currentSong.title}
              </h4>
              <p
                className={`truncate text-[11px] lg:text-xs ${
                  statusText
                    ? isSongLoading
                      ? "theme-muted"
                      : "text-red-400"
                    : "theme-muted"
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
                          ? "var(--foreground)"
                          : "color-mix(in srgb, var(--foreground) 45%, transparent)",
                    }}
                  />
                ))}
              </div>
              <div
                className="pointer-events-none absolute inset-y-0 z-10 w-px bg-[color:color-mix(in_srgb,var(--foreground)_90%,transparent)]"
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
              <span className="text-[color:var(--foreground)]">
                {formatTime(currentTime)}
              </span>
              <span className="theme-muted">
                {" "}
                / {formatTime(duration || 0)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-1.5 lg:flex-1 lg:justify-end lg:gap-2">
            {queuePositionLabel ? (
              <button
                type="button"
                onClick={() => setSidePanelOpen(!isSidePanelOpen)}
                dir={isRtl ? "rtl" : "ltr"}
                className={`theme-surface-soft theme-muted hidden rounded-full border px-3 py-1 xl:inline-flex ${
                  isRtl
                    ? "text-sm font-semibold"
                    : "text-[11px] font-medium uppercase tracking-[0.18em]"
                }`}
                style={{ unicodeBidi: "plaintext" }}
                aria-label={t("miniPlayer.queue")}
                aria-expanded={isSidePanelOpen}
              >
                {t("miniPlayer.queue", { position: queuePositionLabel || "" })}
              </button>
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
                className="theme-asset-icon h-[34px] w-[34px] lg:h-[42px] lg:w-[42px]"
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
                <PauseControlIcon className="theme-asset-icon h-8 w-8 lg:h-8 lg:w-8" />
              ) : (
                <PlayControlIcon className="theme-asset-icon h-8 w-8 lg:h-8 lg:w-8" />
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
                className="theme-asset-icon h-[34px] w-[34px] lg:h-[42px] lg:w-[42px]"
              />
            </button>

            <button
              type="button"
              onClick={toggleRepeat}
              aria-label={repeatModeLabel}
              title={repeatModeLabel}
              aria-pressed={isRepeat}
              className={`relative flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-150 lg:h-10 lg:w-10 ${
                isRepeat
                  ? "theme-button-accent theme-shadow-soft border-transparent text-white"
                  : "theme-button-soft border opacity-75 hover:opacity-100"
              }`}
            >
              <Image
                src="/Repeat.svg"
                alt={repeatModeLabel}
                width={34}
                height={34}
                className="theme-asset-icon h-[34px] w-[34px] lg:h-[42px] lg:w-[42px]"
              />
              {repeatBadgeLabel ? (
                <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-white px-1 text-[9px] font-black leading-none text-black shadow-sm">
                  {repeatBadgeLabel}
                </span>
              ) : null}
            </button>

            <div ref={volumeControlRef} className="relative flex items-center">
              {isVolumeOpen ? (
                <div className="theme-overlay theme-shadow-strong absolute bottom-full right-0 mb-3 w-[min(85vw,220px)] rounded-2xl border px-4 py-4 backdrop-blur-xl lg:right-1 lg:w-[220px]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="theme-muted text-[11px] font-semibold uppercase tracking-[0.18em]">
                        {t("miniPlayer.volume")}
                      </p>
                      <p className="mt-1 text-sm font-medium text-[color:var(--foreground)]">
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
                    <span className="theme-muted text-xs">0</span>
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
                    <span className="theme-muted text-xs">100</span>
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
                  className="theme-asset-icon h-[34px] w-[34px] lg:h-[42px] lg:w-[42px]"
                />
              </button>
            </div>

            <button
              type="button"
              onClick={handleFullscreenToggle}
              className="theme-button-soft flex h-10 w-10 items-center justify-center rounded-full border transition duration-150 hover:scale-[1.03] lg:h-10 lg:w-10"
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
                className="theme-asset-icon h-4 w-4"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MiniPlayer;
