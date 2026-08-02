"use client";

import type { SessionState, UserRole } from "./types";
import { formatDuration, roleCanControl } from "./types";

interface SessionQueueProps {
  state: SessionState;
  role: UserRole | undefined;
  sendCommand: (type: string, payload?: Record<string, unknown>) => void;
}

export function SessionQueue({ state, role, sendCommand }: SessionQueueProps) {
  const { queue } = state;
  const canRemove = roleCanControl(role);

  return (
    <div className="flex flex-col min-h-0 flex-1 rounded-xl border p-5 sm:p-6" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h3 className="text-base font-semibold">Queue</h3>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--surface-3)", color: "var(--muted-foreground)" }}>
          {queue.length} {queue.length === 1 ? "track" : "tracks"}
        </span>
      </div>

      {queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{color:"var(--muted-foreground)"}}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8M12 8v8"/></svg>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            The queue is empty. Search and add some tracks!
          </p>
        </div>
      ) : (
        <ul className="space-y-1 overflow-y-auto flex-1 min-h-0">
          {queue.map((track, index) => (
            <li
              key={`${track.id}-${index}`}
              className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
            >
              {/* Index */}
              <span
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-xs font-medium"
                style={{ background: "var(--surface-3)", color: "var(--muted-foreground)" }}
              >
                {index + 1}
              </span>

              {/* Thumbnail */}
              <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-black/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={track.thumbnail}
                  alt={track.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{track.title}</p>
                <p className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
                  {track.artist}
                  <span className="mx-1">·</span>
                  {formatDuration(track.duration)}
                </p>
              </div>

              {/* Added by */}
              <span
                className="hidden sm:block flex-shrink-0 text-[11px] truncate max-w-[80px]"
                style={{ color: "var(--muted-foreground)" }}
                title={`Added by ${state.userNames?.[track.requestedBy] || track.requestedBy}`}
              >
                {state.userNames?.[track.requestedBy] || track.requestedBy}
              </span>

              {/* Remove button (admin/dj only) */}
              {canRemove && (
                <button
                  onClick={() => sendCommand("queue-remove", { index })}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/15"
                  style={{ color: "#ef4444" }}
                  title="Remove from queue"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
