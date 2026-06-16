"use client";

import {
  buildTimedLyrics,
  findActiveLyricIndex,
  getTrackCacheKey,
  hasTimestampedLyrics,
  LyricsCacheEntry,
  LyricsTrack,
  TimedLyricLine,
} from "./lyrics-shared";

const LYRICS_CACHE_KEY = "streamifyweb_lyrics_cache";
const CACHE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_CACHE_EXPIRY_MS = 6 * 60 * 60 * 1000;
const LYRICS_REQUEST_TIMEOUT_MS = 4500;
const memoryCache = new Map<string, LyricsCacheEntry>();
const missCache = new Map<string, number>();
const pendingRequests = new Map<string, Promise<LyricsCacheEntry | null>>();

function normalizeCacheEntry(entry: LyricsCacheEntry): LyricsCacheEntry {
  return {
    ...entry,
    isSynced: entry.isSynced ?? hasTimestampedLyrics(entry.lyrics),
  };
}

function loadCache(): Map<string, LyricsCacheEntry> {
  if (memoryCache.size > 0) return new Map(memoryCache);
  if (typeof window === "undefined") return new Map();

  try {
    const raw = window.localStorage.getItem(LYRICS_CACHE_KEY);
    if (!raw) return new Map();
    const cache = new Map(JSON.parse(raw) as Array<[string, LyricsCacheEntry]>);
    for (const [key, value] of cache.entries()) {
      memoryCache.set(key, value);
    }
    return cache;
  } catch {
    return new Map();
  }
}

function saveCache(cache: Map<string, LyricsCacheEntry>): void {
  memoryCache.clear();
  for (const [key, value] of cache.entries()) {
    memoryCache.set(key, value);
  }
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      LYRICS_CACHE_KEY,
      JSON.stringify(Array.from(cache.entries()))
    );
  } catch {}
}

export async function fetchLyrics(
  track: LyricsTrack
): Promise<LyricsCacheEntry | null> {
  const cache = loadCache();
  const cacheKey = getTrackCacheKey(track);
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.cachedAt <= CACHE_EXPIRY_MS) {
    return normalizeCacheEntry(cached);
  }

  if (cached) {
    cache.delete(cacheKey);
    saveCache(cache);
  }

  const missedAt = missCache.get(cacheKey);
  if (missedAt && Date.now() - missedAt <= MISS_CACHE_EXPIRY_MS) {
    return null;
  }

  const pending = pendingRequests.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      LYRICS_REQUEST_TIMEOUT_MS
    );

    try {
      const url = new URL("/api/lyrics", window.location.origin);
      url.searchParams.set("id", track.id);
      url.searchParams.set("title", track.title);
      if (track.artist) {
        url.searchParams.set("artist", track.artist);
      }
      if (track.duration && Number.isFinite(track.duration)) {
        url.searchParams.set("duration", Math.round(track.duration).toString());
      }

      const response = await fetch(url.toString(), {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        missCache.set(cacheKey, Date.now());
        return null;
      }

      const payload = (await response.json()) as LyricsCacheEntry | null;
      if (!payload?.lyrics) {
        missCache.set(cacheKey, Date.now());
        return null;
      }

      const normalizedPayload = normalizeCacheEntry({
        ...payload,
        trackId: track.id,
      });

      cache.set(cacheKey, normalizedPayload);
      saveCache(cache);
      missCache.delete(cacheKey);
      return normalizedPayload;
    } catch {
      missCache.set(cacheKey, Date.now());
      return null;
    } finally {
      window.clearTimeout(timeoutId);
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, request);
  return request;
}

export { buildTimedLyrics, findActiveLyricIndex };
export type { LyricsCacheEntry, LyricsTrack, TimedLyricLine };
