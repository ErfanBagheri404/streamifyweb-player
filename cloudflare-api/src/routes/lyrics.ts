import type { WorkerConfig } from "../config";
import { buildProviderUrlCandidates } from "../config";
import { json, withTimeout } from "../http";

type LyricsCandidate = {
  artist: string;
  title: string;
};

type LyricsTrack = {
  id: string;
  title: string;
  artist?: string;
  duration?: number;
};

type LyricsCacheEntry = {
  lyrics: string;
  artistName: string;
  trackName: string;
  trackId: string;
  searchEngine: string;
  isSynced: boolean;
  cachedAt: number;
  requestUrl: string;
};

type LrcLibResponse = {
  syncedLyrics?: unknown;
  plainLyrics?: unknown;
  trackName?: unknown;
  artistName?: unknown;
};

const LYRICS_UPSTREAM_TIMEOUT_MS = 8000;
const MAX_LRCLIB_CANDIDATES = 3;
const MAX_LYRICS_OVH_CANDIDATES = 1;

function hasTimestampedLyrics(value: string): boolean {
  return /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/.test(value);
}

function cleanPart(value: string | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalizeForLookup(value: string): string {
  return cleanPart(value)
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(feat|ft|featuring|official|lyrics|audio|video)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildLyricsCandidates(track: LyricsTrack): LyricsCandidate[] {
  const title = cleanPart(track.title);
  const artist = cleanPart(track.artist);
  const candidates: LyricsCandidate[] = [];
  const seen = new Set<string>();
  const tryAdd = (nextArtist: string, nextTitle: string) => {
    const cleanArtist = cleanPart(nextArtist);
    const cleanTitle = cleanPart(nextTitle);
    if (!cleanTitle) return;
    const key = `${cleanArtist.toLowerCase()}::${cleanTitle.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ artist: cleanArtist, title: cleanTitle });
  };

  tryAdd(artist, title);
  tryAdd(artist, normalizeForLookup(title));
  if (artist) {
    tryAdd(normalizeForLookup(artist), title);
    tryAdd(normalizeForLookup(artist), normalizeForLookup(title));
  }
  tryAdd("", normalizeForLookup(title));

  return candidates.filter((candidate) => candidate.title);
}

function selectLookupCandidates(
  candidates: LyricsCandidate[],
  maxCandidates: number
): LyricsCandidate[] {
  const selected = candidates.slice(0, maxCandidates);
  const finalFallback =
    candidates.length > 0 ? candidates[candidates.length - 1] : null;

  if (
    finalFallback &&
    !selected.some(
      (candidate) =>
        candidate.artist.toLowerCase() === finalFallback.artist.toLowerCase() &&
        candidate.title.toLowerCase() === finalFallback.title.toLowerCase()
    )
  ) {
    selected.push(finalFallback);
  }

  return selected;
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  try {
    return await fetch(url, {
      cache: "no-store",
      signal: withTimeout(undefined, LYRICS_UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

async function fetchFirstSuccessfulResponse(
  urls: string[]
): Promise<{ response: Response; url: string } | null> {
  for (const url of urls) {
    const response = await fetchWithTimeout(url);
    if (response?.ok) return { response, url };
  }

  return null;
}

async function fetchLrcLibLyrics(
  config: WorkerConfig,
  candidate: LyricsCandidate,
  durationSeconds?: number
): Promise<LyricsCacheEntry | null> {
  const requestVariants = [
    buildProviderUrlCandidates(
      config.providers.lyrics.lrclibBase,
      ["/get", "/api/get"],
      {
        artist_name: candidate.artist,
        track_name: candidate.title,
        duration:
          durationSeconds &&
          Number.isFinite(durationSeconds) &&
          durationSeconds > 0
            ? Math.round(durationSeconds)
            : undefined,
      }
    ),
    buildProviderUrlCandidates(
      config.providers.lyrics.lrclibBase,
      ["/get", "/api/get"],
      {
        artist_name: candidate.artist,
        track_name: candidate.title,
      }
    ),
  ];

  for (const urls of requestVariants) {
    const result = await fetchFirstSuccessfulResponse(urls);
    if (!result) continue;

    const payload = (await result.response.json()) as LrcLibResponse;
    const syncedLyrics =
      typeof payload.syncedLyrics === "string" ? payload.syncedLyrics.trim() : "";
    const plainLyrics =
      typeof payload.plainLyrics === "string" ? payload.plainLyrics.trim() : "";
    const lyrics =
      syncedLyrics && hasTimestampedLyrics(syncedLyrics)
        ? syncedLyrics
        : plainLyrics;

    if (!lyrics) continue;

    return {
      lyrics,
      artistName:
        typeof payload.artistName === "string" && payload.artistName.trim()
          ? payload.artistName.trim()
          : candidate.artist,
      trackName:
        typeof payload.trackName === "string" && payload.trackName.trim()
          ? payload.trackName.trim()
          : candidate.title,
      trackId: "",
      searchEngine: "lrclib",
      isSynced: lyrics === syncedLyrics && hasTimestampedLyrics(syncedLyrics),
      cachedAt: Date.now(),
      requestUrl: result.url,
    };
  }

  return null;
}

async function fetchLyricsOvhLyrics(
  config: WorkerConfig,
  candidate: LyricsCandidate
): Promise<LyricsCacheEntry | null> {
  const encodedPath = `/${encodeURIComponent(
    candidate.artist
  )}/${encodeURIComponent(candidate.title)}`;
  const urls = buildProviderUrlCandidates(
    config.providers.lyrics.lyricsOvhBase,
    [`/v1${encodedPath}`, encodedPath]
  );
  const result = await fetchFirstSuccessfulResponse(urls);
  if (!result) return null;

  const payload = (await result.response.json()) as { lyrics?: unknown };
  const lyrics =
    typeof payload.lyrics === "string" ? payload.lyrics.trim() : "";
  if (!lyrics) return null;

  return {
    lyrics,
    artistName: candidate.artist,
    trackName: candidate.title,
    trackId: "",
    searchEngine: "lyrics.ovh",
    isSynced: false,
    cachedAt: Date.now(),
    requestUrl: result.url,
  };
}

export async function handleLyrics(
  request: Request,
  config: WorkerConfig
): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const title = searchParams.get("title") || "";
  const artist = searchParams.get("artist") || "";
  const durationParam = searchParams.get("duration");
  const duration = durationParam ? Number(durationParam) : undefined;

  if (!id || !title) {
    return json(
      { error: "Track id and title are required." },
      { status: 400 }
    );
  }

  const track: LyricsTrack = {
    id,
    title,
    artist,
    duration: Number.isFinite(duration) ? duration : undefined,
  };
  const candidates = buildLyricsCandidates(track);
  if (candidates.length === 0) {
    return json(null, { status: 200 });
  }

  try {
    for (const candidate of selectLookupCandidates(
      candidates,
      MAX_LRCLIB_CANDIDATES
    )) {
      const payload = await fetchLrcLibLyrics(config, candidate, track.duration);
      if (!payload) continue;
      return json({ ...payload, trackId: track.id }, { status: 200 });
    }

    for (const candidate of selectLookupCandidates(
      candidates,
      MAX_LYRICS_OVH_CANDIDATES
    )) {
      const payload = await fetchLyricsOvhLyrics(config, candidate);
      if (!payload) continue;
      return json({ ...payload, trackId: track.id }, { status: 200 });
    }

    return json(null, { status: 200 });
  } catch {
    return json({ error: "Failed to load lyrics." }, { status: 502 });
  }
}
