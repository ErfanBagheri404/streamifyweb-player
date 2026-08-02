"use client";

import { useCallback, useRef, useState } from "react";
import { buildBackendRouteUrl } from "../../lib/backend-api";
import { extractYouTubeVideoId, normalizeYouTubeThumbnailUrl } from "../../lib/youtube-thumbnails";
import type { SessionState } from "./types";
import { formatDuration } from "./types";

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
  source: string;
  views?: number;
}

interface SessionSearchProps {
  sendCommand: (type: string, payload?: Record<string, unknown>) => void;
  claimed: boolean;
}

export function SessionSearch({ sendCommand, claimed }: SessionSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const params = new URLSearchParams({
        q: q.trim(),
        source: "youtube",
        filter: "videos",
        limit: "20",
      });
      const url = buildBackendRouteUrl("/search", { searchParams: params });
      const res = await fetch(`${url}?${params.toString()}`);
      if (!res.ok) {
        setResults([]);
        return;
      }
      const data = await res.json();
      const items: SearchResult[] = (data.items || [])
        .filter((i: any) => i.type === "stream" || i.type === "video" || i.type === "song" || i.title)
        .slice(0, 15)
        .map((i: any) => {
          const rawThumb = i.thumbnail || i.thumbnailUrl || i.coverUrl || "";
          const videoId = extractYouTubeVideoId(i.url || i.videoId || i.id || rawThumb);
          const thumbnail = videoId
            ? normalizeYouTubeThumbnailUrl({ videoId, variant: "hqdefault.jpg", width: 320, height: 180 })
            || rawThumb
            : rawThumb;
          return {
            id: i.url || i.videoId || i.id || "",
            title: i.title || i.name || "",
            artist: i.uploaderName || i.artist || i.channel || "Unknown",
            duration: i.duration || i.lengthSeconds || 0,
            thumbnail,
            source: "youtube",
            views: i.views || 0,
          };
        });
      setResults(items);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 600);
  };

  const handleAdd = (track: SearchResult) => {
    if (!claimed) return;
    sendCommand("queue-add", {
      query: `${track.title} ${track.artist}`,
      source: track.source,
    });
    setAddedId(track.id);
    setTimeout(() => setAddedId(null), 2000);
  };

  return (
    <div className="flex flex-col min-h-0 flex-1 rounded-2xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      {/* Search input */}
      <div className="p-3 pb-0">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={claimed ? "Search to add tracks..." : "Claim session first to add tracks"}
            disabled={!claimed}
            className="w-full rounded-xl border py-2.5 pl-9 pr-4 text-sm outline-none transition-colors focus:border-[var(--theme-accent)] placeholder:text-white/30 disabled:opacity-40"
            style={{
              background: "var(--surface-2)",
              borderColor: "var(--border-subtle)",
              color: "var(--foreground)",
            }}
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--theme-accent)]" />
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-3 pt-2">
        {!claimed ? (
          <p className="mt-6 text-xs text-center" style={{ color: "var(--muted-foreground)" }}>
            Waiting for bot to claim this session...
          </p>
        ) : results.length > 0 ? (
          <ul className="space-y-0.5">
            {results.map((track) => (
              <li
                key={track.id}
                className="group flex items-start gap-3 rounded-lg py-2 transition-colors hover:bg-white/[0.04]"
              >
                <button
                  type="button"
                  onClick={() => handleAdd(track)}
                  className="shrink-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
                >
                  {track.thumbnail ? (
                    <img
                      src={track.thumbnail}
                      alt=""
                      width={120}
                      height={68}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="h-[68px] w-[120px] rounded-xl object-cover"
                    />
                  ) : (
                    <div className="h-[68px] w-[120px] rounded-xl border" style={{ background: "var(--surface-3)" }} />
                  )}
                </button>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>
                    {track.title}
                  </p>
                  <p className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
                    {track.artist}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    <span>{formatDuration(track.duration)}</span>
                    {track.views ? (
                      <>
                        <span className="h-1 w-1 rounded-full bg-current opacity-30" />
                        <span>{track.views.toLocaleString()} views</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleAdd(track)}
                  className="shrink-0 mt-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
                  style={{
                    background: addedId === track.id ? "rgba(34,197,94,0.2)" : "var(--surface-3)",
                    color: addedId === track.id ? "#22c55e" : "var(--muted-foreground)",
                  }}
                >
                  {addedId === track.id ? "Added" : "Add"}
                </button>
              </li>
            ))}
          </ul>
        ) : !searching && query.length > 0 ? (
          <p className="mt-6 text-xs text-center" style={{ color: "var(--muted-foreground)" }}>
            No results found.
          </p>
        ) : (
          <p className="mt-6 text-xs text-center" style={{ color: "var(--muted-foreground)" }}>
            Search by name to add tracks.
          </p>
        )}
      </div>
    </div>
  );
}
