"use client";

import { useCallback, useRef, useState } from "react";
import { buildBackendRouteUrl } from "../../lib/backend-api";
import type { QueuedTrack } from "./types";
import { formatDuration } from "./types";

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
  source: string;
}

interface SessionSearchProps {
  sendCommand: (type: string, payload?: Record<string, unknown>) => void;
}

export function SessionSearch({ sendCommand }: SessionSearchProps) {
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
        .map((i: any) => ({
          id: i.url || i.videoId || i.id || "",
          title: i.title || i.name || "",
          artist: i.uploaderName || i.artist || i.channel || "Unknown",
          duration: i.duration || i.lengthSeconds || 0,
          thumbnail: i.thumbnail || i.thumbnailUrl || i.coverUrl || "",
          source: "youtube",
        }));
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
            placeholder="Search to add tracks..."
            className="w-full rounded-xl border py-2.5 pl-9 pr-4 text-sm outline-none transition-colors focus:border-[var(--theme-accent)] placeholder:text-white/30"
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
        {results.length > 0 ? (
          <ul className="space-y-1">
            {results.map((track) => (
              <li
                key={track.id}
                className="group flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.04] cursor-pointer"
                onClick={() => handleAdd(track)}
              >
                <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-black/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={track.thumbnail} alt={track.title} className="h-full w-full object-cover" loading="lazy" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{track.title}</p>
                  <p className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
                    {track.artist} · {formatDuration(track.duration)}
                  </p>
                </div>
                <span
                  className="flex-shrink-0 text-xs font-medium px-2 py-1 rounded-lg transition-all"
                  style={{
                    background: addedId === track.id ? "rgba(34,197,94,0.2)" : "var(--surface-3)",
                    color: addedId === track.id ? "#22c55e" : "var(--muted-foreground)",
                  }}
                >
                  {addedId === track.id ? "Added" : "Add"}
                </span>
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
