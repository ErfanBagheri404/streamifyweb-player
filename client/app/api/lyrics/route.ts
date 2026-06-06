import { NextRequest, NextResponse } from "next/server";
import {
  buildLyricsCandidates,
  hasTimestampedLyrics,
  LyricsCacheEntry,
  LyricsTrack,
} from "../../lib/lyrics-shared";
import { requireStreamifyRequest } from "../_lib/request-guard";

type LrcLibResponse = {
  syncedLyrics?: unknown;
  plainLyrics?: unknown;
  trackName?: unknown;
  artistName?: unknown;
};

function buildLrcLibUrl(candidate: { artist: string; title: string }, durationSeconds?: number): string {
  const url = new URL("https://lrclib.net/api/get");
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

function buildLyricsOvhUrl(candidate: { artist: string; title: string }): string {
  return `https://api.lyrics.ovh/v1/${encodeURIComponent(
    candidate.artist
  )}/${encodeURIComponent(candidate.title)}`;
}

async function fetchLrcLibLyrics(
  candidate: { artist: string; title: string },
  durationSeconds?: number
): Promise<LyricsCacheEntry | null> {
  const url = buildLrcLibUrl(candidate, durationSeconds);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;

  const json = (await response.json()) as LrcLibResponse;
  const syncedLyrics =
    typeof json.syncedLyrics === "string" ? json.syncedLyrics.trim() : "";

  if (!syncedLyrics || !hasTimestampedLyrics(syncedLyrics)) {
    return null;
  }

  return {
    lyrics: syncedLyrics,
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
    isSynced: true,
    cachedAt: Date.now(),
    requestUrl: url,
  };
}

async function fetchLyricsOvhLyrics(
  candidate: { artist: string; title: string }
): Promise<LyricsCacheEntry | null> {
  const url = buildLyricsOvhUrl(candidate);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;

  const json = (await response.json()) as { lyrics?: unknown };
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
    requestUrl: url,
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
  if (!candidates.length) {
    return NextResponse.json(null, { status: 200 });
  }

  try {
    for (const candidate of candidates) {
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

    for (const candidate of candidates) {
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
