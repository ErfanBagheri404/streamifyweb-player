import { NextRequest, NextResponse } from "next/server";
import {
  buildLyricsCandidates,
  hasTimestampedLyrics,
  LyricsCacheEntry,
  LyricsTrack,
} from "../../lib/lyrics-shared";
import {
  buildProviderUrlCandidates,
  getProviderEndpoints,
} from "../../lib/provider-endpoints";
import { requireStreamifyRequest } from "../_lib/request-guard";

type LrcLibResponse = {
  syncedLyrics?: unknown;
  plainLyrics?: unknown;
  trackName?: unknown;
  artistName?: unknown;
};

const LYRICS_UPSTREAM_TIMEOUT_MS = 8000;
const MAX_LRCLIB_CANDIDATES = 3;
const MAX_LYRICS_OVH_CANDIDATES = 1;

function selectLookupCandidates(
  candidates: Array<{ artist: string; title: string }>,
  maxCandidates: number
): Array<{ artist: string; title: string }> {
  const selected = candidates.slice(0, maxCandidates);
  const finalFallback = candidates.at(-1);

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

function buildLrcLibUrl(
  baseUrl: string,
  candidate: { artist: string; title: string },
  durationSeconds?: number
): string {
  const url = new URL(`${baseUrl}/get`);
  url.searchParams.set("artist_name", candidate.artist);
  url.searchParams.set("track_name", candidate.title);

  if (
    durationSeconds &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0
  ) {
    url.searchParams.set("duration", Math.round(durationSeconds).toString());
  }

  return url.toString();
}

function buildLyricsOvhUrl(
  candidate: {
    artist: string;
    title: string;
  },
  baseUrl: string
): string {
  return `${baseUrl}/${encodeURIComponent(
    candidate.artist
  )}/${encodeURIComponent(candidate.title)}`;
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    LYRICS_UPSTREAM_TIMEOUT_MS
  );

  try {
    return await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
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
  candidate: { artist: string; title: string },
  durationSeconds?: number
): Promise<LyricsCacheEntry | null> {
  const providerEndpoints = await getProviderEndpoints();
  const requestVariants = [
    buildProviderUrlCandidates(
      providerEndpoints.providers.lyrics.lrclibBase,
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
      providerEndpoints.providers.lyrics.lrclibBase,
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

    const json = (await result.response.json()) as LrcLibResponse;
    const syncedLyrics =
      typeof json.syncedLyrics === "string" ? json.syncedLyrics.trim() : "";
    const plainLyrics =
      typeof json.plainLyrics === "string" ? json.plainLyrics.trim() : "";
    const lyrics =
      syncedLyrics && hasTimestampedLyrics(syncedLyrics)
        ? syncedLyrics
        : plainLyrics;

    if (!lyrics) continue;

    return {
      lyrics,
      artistName:
        typeof json.artistName === "string" && json.artistName.trim()
          ? json.artistName.trim()
          : candidate.artist,
      trackName:
        typeof json.trackName === "string" && json.trackName.trim()
          ? json.trackName.trim()
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

async function fetchLyricsOvhLyrics(candidate: {
  artist: string;
  title: string;
}): Promise<LyricsCacheEntry | null> {
  const providerEndpoints = await getProviderEndpoints();
  const encodedPath = `/${encodeURIComponent(
    candidate.artist
  )}/${encodeURIComponent(candidate.title)}`;
  const urls = buildProviderUrlCandidates(
    providerEndpoints.providers.lyrics.lyricsOvhBase,
    [`/v1${encodedPath}`, encodedPath]
  );
  const url = urls[0] || "";
  const result = await fetchFirstSuccessfulResponse(urls);
  if (!result) return null;

  const json = (await result.response.json()) as { lyrics?: unknown };
  const lyrics = typeof json.lyrics === "string" ? json.lyrics.trim() : "";
  if (!lyrics) return null;

  return {
    lyrics,
    artistName: candidate.artist,
    trackName: candidate.title,
    trackId: "",
    searchEngine: "lyrics.ovh",
    isSynced: false,
    cachedAt: Date.now(),
    requestUrl: result.url || url,
  };
}

export async function GET(request: NextRequest) {
  const blockedResponse = requireStreamifyRequest(request);
  if (blockedResponse) return blockedResponse;

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get("id") || "";
  const title = searchParams.get("title") || "";
  const artist = searchParams.get("artist") || "";
  const durationParam = searchParams.get("duration");
  const duration = durationParam ? Number(durationParam) : undefined;

  if (!id || !title) {
    return NextResponse.json(
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
  const lrclibCandidates = selectLookupCandidates(
    candidates,
    MAX_LRCLIB_CANDIDATES
  );
  const lyricsOvhCandidates = selectLookupCandidates(
    candidates,
    MAX_LYRICS_OVH_CANDIDATES
  );
  if (!candidates.length) {
    return NextResponse.json(null, { status: 200 });
  }

  try {
    for (const candidate of lrclibCandidates) {
      const payload = await fetchLrcLibLyrics(candidate, track.duration);
      if (!payload) continue;

      return NextResponse.json(
        {
          ...payload,
          trackId: track.id,
        },
        { status: 200 }
      );
    }

    for (const candidate of lyricsOvhCandidates) {
      const payload = await fetchLyricsOvhLyrics(candidate);
      if (!payload) continue;

      return NextResponse.json(
        {
          ...payload,
          trackId: track.id,
        },
        { status: 200 }
      );
    }
    return NextResponse.json(null, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to load lyrics." },
      { status: 502 }
    );
  }
}
