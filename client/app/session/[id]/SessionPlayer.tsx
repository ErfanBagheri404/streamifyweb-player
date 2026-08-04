"use client";

import { useEffect, useRef, useState } from "react";
import type { SessionState, UserRole } from "./types";
import { formatDuration, roleCanControl } from "./types";

const FILTERS = [
  { value: "", label: "None" },
  { value: "bassboost", label: "Bass Boost" },
  { value: "nightcore", label: "Nightcore" },
  { value: "vaporwave", label: "Vaporwave" },
  { value: "8d", label: "8D" },
  { value: "equalizer", label: "Equalizer" },
  { value: "karaoke", label: "Karaoke" },
  { value: "tremolo", label: "Tremolo" },
  { value: "vibrato", label: "Vibrato" },
  { value: "flanger", label: "Flanger" },
  { value: "phaser", label: "Phaser" },
  { value: "lowpass", label: "Low Pass" },
  { value: "highpass", label: "High Pass" },
  { value: "channels", label: "Channels" },
  { value: "gate", label: "Gate" },
  { value: "sidescreen", label: "Sidechain" },
];

function discordAvatarUrl(userId: string, avatar: string | null | undefined): string | null {
  if (!userId || !avatar) return null;
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=64`;
}

interface SessionPlayerProps {
  state: SessionState;
  role: UserRole | undefined;
  sendCommand: (type: string, payload?: Record<string, unknown>) => void;
}

export function SessionPlayer({ state, role, sendCommand }: SessionPlayerProps) {
  const [localProgress, setLocalProgress] = useState(0);
  const [showFilter, setShowFilter] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const lastTrackIdRef = useRef<string | null>(null);
  const isDisabled = !roleCanControl(role);

  const [optimisticLoop, setOptimisticLoop] = useState<boolean | null>(null);
  const [optimisticLoopQueue, setOptimisticLoopQueue] = useState<boolean | null>(null);

  const { current, isPlaying, loop, loopQueue, filter } = state;
  const loopActive = optimisticLoop ?? loop;
  const loopQueueActive = optimisticLoopQueue ?? loopQueue;

  useEffect(() => { setOptimisticLoop(null); }, [loop]);
  useEffect(() => { setOptimisticLoopQueue(null); }, [loopQueue]);

  const requestedById = current?.requestedBy ?? "";
  const requestedByName = state.userNames?.[requestedById] || requestedById || "Unknown";
  const requestedByAvatarUrl = discordAvatarUrl(requestedById, state.userAvatars?.[requestedById]);

  const trackId = current?.id ?? null;
  if (trackId !== lastTrackIdRef.current) {
    lastTrackIdRef.current = trackId;
    setLocalProgress(0);
  }

  useEffect(() => {
    if (!current || !isPlaying) return;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      setLocalProgress((prev) => Math.min(prev + dt, current.duration));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [current, isPlaying]);

  return (
    <div className="rounded-xl border p-5 sm:p-6" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      {!current ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="relative">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{color:"var(--muted-foreground)"}}>
              <circle cx="12" cy="12" r="10"/>
              <path d="M9 10V16M15 10V16M8 10h8M9 8h6"/>
            </svg>
          </div>
          {state.queue.length > 0 ? (
            <>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                {state.queue.length} track{state.queue.length > 1 ? "s" : ""} in queue
              </p>
              <button
                onClick={() => sendCommand("play")}
                disabled={isDisabled}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
                style={{ background: "var(--theme-accent)", color: "var(--theme-accent-contrast)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                Play Queue
              </button>
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Nothing playing right now. Add something to the queue!
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Track info */}
          <div className="flex gap-4 items-start">
            <div className="relative h-24 w-24 sm:h-32 sm:w-32 flex-shrink-0 overflow-hidden rounded-lg bg-black/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.thumbnail} alt={current.title} className="h-full w-full object-cover" loading="lazy" />
              <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/80 backdrop-blur-sm">
                {current.source}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-bold truncate">{current.title}</h2>
              <p className="text-sm truncate" style={{ color: "var(--muted-foreground)" }}>
                {current.artist}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5" style={{ color: "var(--muted-foreground)" }}>
                {requestedByAvatarUrl ? (
                  <img src={requestedByAvatarUrl} alt="" className="h-4 w-4 rounded-full" />
                ) : requestedById ? (
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold" style={{ background: "var(--surface-3)", color: "var(--foreground)" }}>
                    {requestedByName.charAt(0).toUpperCase()}
                  </span>
                ) : null}
                <span className="text-xs">Added by {requestedByName}</span>
              </div>

              {filter && (
                <span
                  className="mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{ background: "var(--surface-3)", color: "var(--theme-accent)" }}
                >
                  {filter}
                </span>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div
            ref={progressRef}
            className="group mt-5 h-1.5 w-full rounded-full overflow-hidden cursor-pointer"
            style={{ background: "var(--surface-3)" }}
            title={`${formatDuration(localProgress)} / ${formatDuration(current.duration)}`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-200"
              style={{
                width: `${(localProgress / current.duration) * 100}%`,
                background: "var(--theme-accent)",
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs" style={{ color: "var(--muted-foreground)" }}>
            <span className="tabular-nums">{formatDuration(localProgress)}</span>
            <span className="tabular-nums">{formatDuration(current.duration)}</span>
          </div>

          {/* All controls in one row */}
          <div className="mt-4 flex items-center justify-center gap-1 sm:gap-2">
            {/* Loop — compact pill */}
            <button
              disabled={isDisabled}
              onClick={() => { setOptimisticLoop(!loopActive); sendCommand("loop"); }}
              className="flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
              style={{
                background: loopActive ? "rgba(var(--theme-accent-rgb, 128,128,128), 0.15)" : "transparent",
                color: loopActive ? "var(--theme-accent)" : "var(--muted-foreground)",
                border: loopActive ? "1px solid rgba(var(--theme-accent-rgb, 128,128,128), 0.3)" : "1px solid transparent",
              }}
              title={loopActive ? "Disable loop" : "Enable loop"}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
              <span className="hidden sm:inline">Loop</span>
            </button>

            {/* Prev */}
            <button
              disabled={isDisabled}
              onClick={() => sendCommand("prev")}
              className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-90 disabled:opacity-40"
              style={{ color: "var(--foreground)" }}
              title="Previous"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/></svg>
            </button>

            {/* Skip */}
            <button
              disabled={isDisabled}
              onClick={() => sendCommand("skip")}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-90 disabled:opacity-40"
              style={{ color: "var(--foreground)" }}
              title="Skip"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>

            {/* Play / Pause — center, largest */}
            <button
              disabled={isDisabled}
              onClick={() => sendCommand(isPlaying ? "pause" : "resume")}
              className="flex h-12 w-12 items-center justify-center rounded-full transition-all hover:scale-105 active:scale-90 disabled:opacity-40 disabled:hover:scale-100 shadow-lg"
              style={{ background: "var(--theme-accent)", color: "var(--theme-accent-contrast)" }}
              title={isPlaying ? "Pause" : "Resume"}
            >
              {isPlaying ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z"/></svg>
              )}
            </button>

            {/* Stop */}
            <button
              disabled={isDisabled}
              onClick={() => sendCommand("stop")}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-90 disabled:opacity-40"
              style={{ color: "var(--foreground)" }}
              title="Stop"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            </button>

            {/* Next */}
            <button
              disabled={isDisabled}
              onClick={() => sendCommand("skip")}
              className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-90 disabled:opacity-40"
              style={{ color: "var(--foreground)" }}
              title="Next"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2V6zM6 18l8.5-6L6 6v12z"/></svg>
            </button>

            {/* Queue Loop — compact pill */}
            <button
              disabled={isDisabled}
              onClick={() => { setOptimisticLoopQueue(!loopQueueActive); sendCommand("loopqueue"); }}
              className="flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
              style={{
                background: loopQueueActive ? "rgba(var(--theme-accent-rgb, 128,128,128), 0.15)" : "transparent",
                color: loopQueueActive ? "var(--theme-accent)" : "var(--muted-foreground)",
                border: loopQueueActive ? "1px solid rgba(var(--theme-accent-rgb, 128,128,128), 0.3)" : "1px solid transparent",
              }}
              title={loopQueueActive ? "Disable queue loop" : "Enable queue loop"}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
              <span className="hidden sm:inline">Q</span>
            </button>

            {/* Filter */}
            <div className="relative">
              <button
                disabled={isDisabled}
                onClick={() => setShowFilter(!showFilter)}
                className="flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
                style={{
                  background: filter ? "rgba(var(--theme-accent-rgb, 128,128,128), 0.15)" : "transparent",
                  color: filter ? "var(--theme-accent)" : "var(--muted-foreground)",
                  border: filter ? "1px solid rgba(var(--theme-accent-rgb, 128,128,128), 0.3)" : "1px solid transparent",
                }}
                title="Audio filter"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>
                <span className="hidden sm:inline">{filter || "Filter"}</span>
              </button>
              {showFilter && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 w-44 rounded-xl border p-1.5 shadow-xl"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
                >
                  {FILTERS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => {
                        sendCommand("filter", { filter: f.value || null });
                        setShowFilter(false);
                      }}
                      className="flex w-full items-center rounded-lg px-3 py-1.5 text-left text-xs font-medium transition-colors hover:bg-white/5"
                      style={{
                        color: filter === f.value || (!filter && !f.value) ? "var(--theme-accent)" : "var(--foreground)",
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
