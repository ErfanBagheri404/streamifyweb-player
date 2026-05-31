import { readFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const JIOSAAVN_API_BASE = "https://streamifyjiosaavn.vercel.app";
const PIPED_INSTANCE = "https://api.piped.private.coffee";
const BEATSEEK_API_BASE = "https://beatseek.io/api";
const DEBUG_ENV_PATH = ".dbg/soundcloud-collection-bug.env";
const DEBUG_SERVER_URL_FALLBACK = "http://127.0.0.1:7777/event";
const DEBUG_SESSION_ID_FALLBACK = "soundcloud-collection-bug";

type CollectionResponse = {
  collection: {
    id: string;
    title: string;
    author?: string;
    thumbnailUrl?: string;
    url?: string;
    count?: number;
    source?: string;
    description?: string;
  };
  entries: Array<{
    id: string;
    title: string;
    subtitle?: string;
    thumbnailUrl?: string;
    duration?: number;
    artist?: string;
    url?: string;
    album?: string;
    addedAt?: string;
  }>;
};

function getDebugConfig(): { url: string; sessionId: string } {
  let url = DEBUG_SERVER_URL_FALLBACK;
  let sessionId = DEBUG_SESSION_ID_FALLBACK;

  try {
    const envText = readFileSync(DEBUG_ENV_PATH, "utf8");
    const nextUrl = envText.match(/^DEBUG_SERVER_URL=(.+)$/m)?.[1]?.trim();
    const nextSessionId = envText
      .match(/^DEBUG_SESSION_ID=(.+)$/m)?.[1]
      ?.trim();

    if (nextUrl) url = nextUrl;
    if (nextSessionId) sessionId = nextSessionId;
  } catch {}

  return { url, sessionId };
}

function reportDebugEvent(
  runId: string,
  hypothesisId: string,
  location: string,
  msg: string,
  data: Record<string, unknown>
) {
  const { url, sessionId } = getDebugConfig();
  if (!url) return;

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      runId,
      hypothesisId,
      location,
      msg,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function qualityScore(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/(\d+)/);
    if (match) return Number(match[1]);
  }
  return 0;
}

function pickImageUrl(value: unknown): string {
  const images = toArray(value)
    .map((entry) => toRecord(entry))
    .sort(
      (a, b) =>
        qualityScore(b.quality || b.size) - qualityScore(a.quality || a.size)
    );

  for (const image of images) {
    const url = safeString(image.url || image.link);
    if (url) return url;
  }

  return "";
}

function pickArtistName(value: unknown): string {
  const artists = toRecord(value);
  const groups = [artists.primary, artists.featured, artists.all];

  for (const group of groups) {
    const names = toArray(group)
      .map((entry) => safeString(toRecord(entry).name))
      .filter(Boolean);
    if (names.length) return names.join(", ");
  }

  return "";
}

function normalizeDurationSeconds(value: unknown): number | undefined {
  const numeric = safeNumber(value);
  if (numeric == null) return undefined;
  return numeric > 10000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

function extractYouTubeVideoId(value: string): string {
  if (!value) return "";
  const watchMatch = value.match(/[?&]v=([^&]+)/);
  if (watchMatch?.[1]) return watchMatch[1];

  const shortMatch = value.match(/youtu\.be\/([^?]+)/);
  if (shortMatch?.[1]) return shortMatch[1];

  const pathMatch = value.match(/\/watch\?v=([^&]+)/);
  if (pathMatch?.[1]) return pathMatch[1];

  return "";
}

function extractYouTubePlaylistId(value: string): string {
  if (!value) return "";

  const listMatch = value.match(/[?&]list=([^&]+)/);
  if (listMatch?.[1]) return listMatch[1];

  if (/^[A-Za-z0-9_-]{10,}$/.test(value) && !value.includes("/")) {
    return value;
  }

  return "";
}

function upgradeSoundCloudImage(url: string): string {
  if (!url) return "";

  return url
    .replace("-large.", "-t500x500.")
    .replace("large.jpg", "t500x500.jpg")
    .replace("large.png", "t500x500.png");
}

function pickSoundCloudCollectionImage(
  payload: Record<string, unknown>
): string {
  const directCandidates = [
    safeString(payload.thumbnailUrl),
    safeString(payload.thumbnail_url),
    safeString(payload.artworkUrl),
    safeString(payload.artwork_url),
    safeString(payload.image),
    safeString(payload.imageUrl),
    safeString(payload.image_url),
  ];

  for (const candidate of directCandidates) {
    const upgraded = upgradeSoundCloudImage(candidate);
    if (upgraded) return upgraded;
  }

  const user = toRecord(payload.user);
  const userCandidates = [
    safeString(user.avatar_url),
    safeString(user.avatarUrl),
    safeString(user.image),
  ];

  for (const candidate of userCandidates) {
    const upgraded = upgradeSoundCloudImage(candidate);
    if (upgraded) return upgraded;
  }

  return "";
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${text}`.trim());
  }

  return res.json() as Promise<unknown>;
}

function normalizeJioSaavnSong(song: unknown, albumTitle?: string) {
  const record = toRecord(song);
  return {
    id: safeString(record.id || record.songid || record.url),
    title: safeString(record.name || record.title || record.song) || "Unknown",
    subtitle: pickArtistName(record.artists),
    artist: pickArtistName(record.artists),
    thumbnailUrl: pickImageUrl(record.image),
    duration: safeNumber(record.duration),
    url: safeString(record.url),
    album: albumTitle,
  };
}

function pickJioSaavnRoot(payload: unknown): Record<string, unknown> {
  const record = toRecord(payload);
  const candidates = [
    toRecord(record.data),
    toRecord(record.playlist),
    toRecord(record.album),
    record,
  ];
  return (
    candidates.find((candidate) => Object.keys(candidate).length > 0) || {}
  );
}

async function fetchJioSaavnCollection(
  id: string,
  kind: "playlist" | "album"
): Promise<CollectionResponse> {
  const endpoint =
    kind === "playlist"
      ? `${JIOSAAVN_API_BASE}/api/playlists?id=${encodeURIComponent(id)}`
      : `${JIOSAAVN_API_BASE}/api/albums?id=${encodeURIComponent(id)}`;

  const payload = await fetchJson(endpoint);
  const root = pickJioSaavnRoot(payload);

  if (!Object.keys(root).length) {
    throw new Error("Collection not found");
  }

  const title =
    safeString(root.name || root.title) ||
    (kind === "playlist" ? "Playlist" : "Album");
  const entries = toArray(root.songs)
    .map((song) => normalizeJioSaavnSong(song, title))
    .filter((entry) => entry.id);

  return {
    collection: {
      id: safeString(root.id || id),
      title,
      author:
        pickArtistName(root.artists) ||
        safeString(root.artist || root.subtitle || root.description),
      thumbnailUrl: pickImageUrl(root.image),
      url: safeString(root.url),
      count:
        safeNumber(root.songCount || root.song_count || root.count) ||
        entries.length,
      source: "jiosaavn",
      description: safeString(root.description),
    },
    entries,
  };
}

async function fetchPipedPlaylist(
  id: string,
  source: "youtube" | "youtubemusic"
): Promise<CollectionResponse> {
  const playlistId = extractYouTubePlaylistId(id) || id;
  const payload = toRecord(
    await fetchJson(
      `${PIPED_INSTANCE}/playlists/${encodeURIComponent(playlistId)}`
    )
  );
  const title = safeString(payload.name) || "Playlist";
  const entries = toArray(payload.relatedStreams)
    .map((stream, index) => {
      const record = toRecord(stream);
      const streamUrl = safeString(record.url);
      const videoId =
        safeString(record.videoId || record.id) ||
        extractYouTubeVideoId(streamUrl);

      return {
        id: videoId || `${playlistId}-${index}`,
        title: safeString(record.title) || `Track ${index + 1}`,
        subtitle: safeString(record.uploaderName),
        artist: safeString(record.uploaderName),
        thumbnailUrl: safeString(record.thumbnail),
        duration: safeNumber(record.duration),
        url: streamUrl,
        album: title,
        addedAt: safeString(record.uploadedDate),
      };
    })
    .filter((entry) => entry.id);

  return {
    collection: {
      id: playlistId,
      title,
      author: safeString(payload.uploader),
      thumbnailUrl: safeString(payload.thumbnailUrl),
      url:
        source === "youtubemusic"
          ? `https://music.youtube.com/playlist?list=${encodeURIComponent(
              playlistId
            )}`
          : `https://www.youtube.com/playlist?list=${encodeURIComponent(
              playlistId
            )}`,
      count: safeNumber(payload.videos) || entries.length,
      source,
      description: safeString(payload.description),
    },
    entries,
  };
}

async function fetchSoundCloudCollection(
  url: string,
  runId: string
): Promise<CollectionResponse> {
  // #region debug-point B:soundcloud-collection-fetch-start
  reportDebugEvent(
    runId,
    "B",
    "app/api/collection/route.ts:fetchSoundCloudCollection:start",
    "[DEBUG] fetching SoundCloud collection upstream",
    {
      url,
      beatseekUrl: `${BEATSEEK_API_BASE}/playlist?url=${encodeURIComponent(
        url
      )}`,
    }
  );
  // #endregion
  const payload = toRecord(
    await fetchJson(
      `${BEATSEEK_API_BASE}/playlist?url=${encodeURIComponent(url)}`
    )
  );
  const title = safeString(payload.playlistTitle) || "SoundCloud Collection";
  const collectionThumbnailUrl = pickSoundCloudCollectionImage(payload);
  const entries = toArray(payload.tracks)
    .map((track, index) => {
      const record = toRecord(track);
      const user = toRecord(record.user);
      const trackUrl = safeString(record.url);
      return {
        id: String(record.id || trackUrl || `${title}-${index}`),
        title: safeString(record.title) || `Track ${index + 1}`,
        subtitle: safeString(user.username || record.genre),
        artist: safeString(user.username),
        thumbnailUrl: upgradeSoundCloudImage(safeString(record.artwork_url)),
        duration: normalizeDurationSeconds(record.duration),
        url: trackUrl,
        album: title,
        addedAt: safeString(record.created_at),
      };
    })
    .filter((entry) => entry.id);

  // #region debug-point B:soundcloud-collection-fetch-success
  reportDebugEvent(
    runId,
    "B",
    "app/api/collection/route.ts:fetchSoundCloudCollection:success",
    "[DEBUG] fetched SoundCloud collection upstream",
    {
      url,
      title,
      total: safeNumber(payload.total) ?? null,
      entryCount: entries.length,
      firstEntryId: entries[0]?.id ?? null,
    }
  );
  // #endregion

  return {
    collection: {
      id: url,
      title,
      thumbnailUrl: collectionThumbnailUrl,
      url: safeString(payload.playlistUrl) || url,
      count: safeNumber(payload.total) || entries.length,
      source: "soundcloud",
    },
    entries,
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get("id");
  const kind = searchParams.get("kind") === "album" ? "album" : "playlist";
  const source = (searchParams.get("source") || "").toLowerCase();
  const url = searchParams.get("url") || "";
  const runId = `pre-${Date.now()}`;

  // #region debug-point A:collection-route-entry
  reportDebugEvent(
    runId,
    "A",
    "app/api/collection/route.ts:GET:entry",
    "[DEBUG] collection route request received",
    {
      requestUrl: request.url,
      id,
      kind,
      source,
      url,
    }
  );
  // #endregion

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    let response: CollectionResponse | null = null;
    const normalizedYouTubePlaylistId = extractYouTubePlaylistId(id || url);

    if (source === "jiosaavn") {
      response = await fetchJioSaavnCollection(id, kind);
    } else if (
      source === "youtube" &&
      kind === "playlist" &&
      normalizedYouTubePlaylistId
    ) {
      response = await fetchPipedPlaylist(
        normalizedYouTubePlaylistId,
        "youtube"
      );
    } else if (
      source === "youtubemusic" &&
      kind === "playlist" &&
      normalizedYouTubePlaylistId
    ) {
      response = await fetchPipedPlaylist(
        normalizedYouTubePlaylistId,
        "youtubemusic"
      );
    } else if (source === "soundcloud" && url) {
      response = await fetchSoundCloudCollection(url, runId);
    }

    if (!response) {
      // #region debug-point C:collection-route-unsupported
      reportDebugEvent(
        runId,
        "C",
        "app/api/collection/route.ts:GET:unsupported",
        "[DEBUG] collection route unsupported branch",
        {
          id,
          kind,
          source,
          url,
        }
      );
      // #endregion
      return NextResponse.json(
        { error: "Unsupported collection source" },
        { status: 400 }
      );
    }

    // #region debug-point C:collection-route-success
    reportDebugEvent(
      runId,
      "C",
      "app/api/collection/route.ts:GET:success",
      "[DEBUG] collection route completed",
      {
        source,
        kind,
        collectionId: response.collection.id,
        collectionTitle: response.collection.title,
        entryCount: response.entries.length,
      }
    );
    // #endregion

    return NextResponse.json(response);
  } catch (error) {
    // #region debug-point C:collection-route-error
    reportDebugEvent(
      runId,
      "C",
      "app/api/collection/route.ts:GET:error",
      "[DEBUG] collection route failed",
      {
        id,
        kind,
        source,
        url,
        error: error instanceof Error ? error.message : String(error),
      }
    );
    // #endregion
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load collection",
      },
      { status: 500 }
    );
  }
}
