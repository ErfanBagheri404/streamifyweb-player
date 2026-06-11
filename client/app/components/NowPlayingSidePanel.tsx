"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAudio } from "../contexts/AudioContext";
import { useAppLanguage } from "../hooks/useAppLanguage";
import { useSidePanel } from "../contexts/SidePanelContext";

export default function NowPlayingSidePanel() {
  const pathname = usePathname();
  const { t, isRtl, formatNumber } = useAppLanguage();
  const { isOpen, setIsOpen } = useSidePanel();
  const {
    currentSong,
    playbackQueue,
    queueIndex,
    isFullscreenOpen,
    isPlayerVisible,
    playQueueIndex,
  } = useAudio();

  useEffect(() => {
    if (isFullscreenOpen && isOpen) {
      setIsOpen(false);
    }
  }, [isFullscreenOpen, isOpen, setIsOpen]);

  if (isFullscreenOpen) return null;

  const isAuthPage =
    pathname.startsWith("/signin") || pathname.startsWith("/signup");

  if (isAuthPage) return null;

  if (!currentSong && playbackQueue.length === 0) return null;

  return (
    <aside
      aria-hidden={!isOpen}
      className={`theme-surface-strong hidden min-h-0 flex-1 overflow-hidden rounded-xl border xl:flex xl:flex-col ${
        isPlayerVisible ? "xl:mb-20" : ""
      } transition-[width,opacity] duration-200 ${
        isOpen
          ? "w-[340px] opacity-100"
          : "pointer-events-none w-0 opacity-0 border-transparent"
      } ${isRtl ? "order-first" : "order-last"}`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl">
        <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] px-4 py-3">
          <p className="text-sm font-bold uppercase tracking-[0.18em]">
            {t("common.nowPlaying")}
          </p>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="theme-button-soft flex h-8 w-8 items-center justify-center rounded-full text-xs transition"
            aria-label={t("common.close")}
          >
            ×
          </button>
        </div>

        {currentSong ? (
          <div className="flex flex-col items-center gap-2 px-4 pb-4 pt-4 text-center">
            <div
              className="theme-surface-soft relative aspect-square w-full max-w-[160px] overflow-hidden rounded-xl border"
              style={{
                backgroundImage: currentSong.coverUrl
                  ? `url(${currentSong.coverUrl})`
                  : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              {currentSong.coverUrl ? null : (
                <span className="flex h-full w-full items-center justify-center text-2xl font-black text-[color:color-mix(in_srgb,var(--foreground)_30%,transparent)]">
                  ♪
                </span>
              )}
            </div>
            <div className="min-w-0 w-full">
              <p className="truncate text-sm font-bold">{currentSong.title}</p>
              <p className="theme-muted truncate text-xs">
                {currentSong.artist}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-[color:var(--border-subtle)] px-4 py-2">
          <p className="theme-muted text-xs font-bold uppercase tracking-[0.18em]">
            {t("common.queue")}
          </p>
          {playbackQueue.length > 0 ? (
            <p className="theme-muted text-[11px]">
              {t("miniPlayer.queuePosition", {
                current: formatNumber(
                  queueIndex >= 0 ? queueIndex + 1 : playbackQueue.length
                ),
                total: formatNumber(playbackQueue.length),
              })}
            </p>
          ) : null}
        </div>
        <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {playbackQueue.length === 0 ? (
            <p className="theme-muted px-2 py-6 text-center text-xs">
              {t("common.noneYet")}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {playbackQueue.map((song, index) => {
                const isCurrent = index === queueIndex;
                return (
                  <li key={`${song.id}-${index}`}>
                    <button
                      type="button"
                      onClick={() => playQueueIndex(index)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-start transition ${
                        isCurrent
                          ? "theme-surface-soft border-[color:var(--border-subtle)]"
                          : "border-transparent hover:bg-[color:color-mix(in_srgb,var(--surface-3)_72%,transparent)]"
                      }`}
                    >
                      <div
                        className="theme-surface-soft relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-md border"
                        style={{
                          backgroundImage: song.coverUrl
                            ? `url(${song.coverUrl})`
                            : undefined,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      >
                        {song.coverUrl ? null : (
                          <span className="flex h-full w-full items-center justify-center text-xs text-[color:color-mix(in_srgb,var(--foreground)_30%,transparent)]">
                            ♪
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm ${
                            isCurrent ? "font-bold" : "font-medium"
                          }`}
                        >
                          {song.title}
                        </p>
                        <p className="theme-muted truncate text-[11px]">
                          {song.artist}
                        </p>
                      </div>
                      <span className="theme-muted text-[11px]">
                        {formatNumber(index + 1)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
