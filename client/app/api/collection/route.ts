import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { requireStreamifyRequest } from "../_lib/request-guard";
import {
  getInvidiousInstances,
  getPipedInstances,
} from "../../lib/media-providers";
import {
  buildProviderUrlCandidates,
  getProviderEndpoints,
} from "../../lib/provider-endpoints";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const COLLECTION_FETCH_TIMEOUT_MS = 12000;
const execFileAsync = promisify(execFile);

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

function reportDebugEvent(
  _runId: string,
  _hypothesisId: string,
  _location: string,
  _msg: string,
  _data: Record<string, unknown>
) {}

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

function isYouTubeMixId(value: string): boolean {
  return /^RD[A-Za-z0-9_-]{6,}$/.test(value);
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
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    COLLECTION_FETCH_TIMEOUT_MS
  );

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${text}`.trim());
    }

    return JSON.parse(text.replace(/^\uFEFF/, "").trim() || "null");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldTryPowerShell =
      process.platform === "win32" &&
      (/fetch failed|aborted|ECONNRESET|UND_ERR_CONNECT_TIMEOUT/i.test(
        message
      ) ||
        message.includes("This operation was aborted"));

    if (!shouldTryPowerShell) {
      throw error;
    }

    const escapedUrl = url.replace(/'/g, "''");
    const escapedUserAgent = USER_AGENT.replace(/'/g, "''");
    const script = [
      "$ProgressPreference = 'SilentlyContinue'",
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
      `$headers = @{ 'User-Agent' = '${escapedUserAgent}'; 'Accept' = 'application/json, text/plain;q=0.9, */*;q=0.8' }`,
      `$response = Invoke-RestMethod -Uri '${escapedUrl}' -Headers $headers -TimeoutSec ${Math.max(
        1,
        Math.ceil(COLLECTION_FETCH_TIMEOUT_MS / 1000)
      )}`,
      "$response | ConvertTo-Json -Depth 100 -Compress",
    ].join("; ");

    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        timeout: COLLECTION_FETCH_TIMEOUT_MS + 3000,
        maxBuffer: 1024 * 1024 * 5,
      }
    );

    return JSON.parse(stdout.replace(/^\uFEFF/, "").trim() || "null");
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFirstSuccessfulJsonUrl(urls: string[]): Promise<unknown> {
  const errors: string[] = [];

  for (const url of urls) {
    try {
      return await fetchJson(url);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors.join(" | ") || "All requests failed");
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
  const providerEndpoints = await getProviderEndpoints();
  const endpointCandidates =
    kind === "playlist"
      ? buildProviderUrlCandidates(
          providerEndpoints.providers.jiosaavn.apiBase,
          ["/api/playlists", "/playlists"],
          { id }
        )
      : buildProviderUrlCandidates(
          providerEndpoints.providers.jiosaavn.apiBase,
          ["/api/albums", "/albums"],
          { id }
        );

  const payload = await fetchFirstSuccessfulJsonUrl(endpointCandidates);
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
  const providerEndpoints = await getProviderEndpoints();
  const youtube = providerEndpoints.providers.youtube;
  const playlistId = extractYouTubePlaylistId(id) || id;
  const errors: string[] = [];

  for (const instance of await getPipedInstances()) {
    try {
      const payload = toRecord(
        await fetchJson(
          `${instance}/playlists/${encodeURIComponent(playlistId)}`
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
              ? `${youtube.musicBase}/playlist?list=${encodeURIComponent(
                  playlistId
                )}`
              : `${youtube.webBase}/playlist?list=${encodeURIComponent(
                  playlistId
                )}`,
          count: safeNumber(payload.videos) || entries.length,
          source,
          description: safeString(payload.description),
        },
        entries,
      };
    } catch (error) {
      errors.push(
        `${instance}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  throw new Error(errors.join(" | ") || "Failed to load YouTube playlist");
}

async function fetchInvidiousMix(
  id: string,
  source: "youtube" | "youtubemusic"
): Promise<CollectionResponse> {
  const providerEndpoints = await getProviderEndpoints();
  const youtube = providerEndpoints.providers.youtube;
  const mixId = extractYouTubePlaylistId(id) || id;
  const errors: string[] = [];

  for (const instance of await getInvidiousInstances()) {
    try {
      const payload = toRecord(
        await fetchJson(`${instance}/api/v1/mixes/${encodeURIComponent(mixId)}`)
      );
      const title = safeString(payload.title) || "Mix";
      const entries = toArray(payload.videos)
        .map((video, index) => {
          const record = toRecord(video);
          const thumbnails = toArray(record.videoThumbnails).map((entry) =>
            toRecord(entry)
          );
          const thumbnail = thumbnails.sort(
            (a, b) =>
              qualityScore(b.width || b.quality) -
              qualityScore(a.width || a.quality)
          )[0];

          return {
            id: safeString(record.videoId) || `${mixId}-${index}`,
            title: safeString(record.title) || `Track ${index + 1}`,
            subtitle: safeString(record.author),
            artist: safeString(record.author),
            thumbnailUrl: safeString(thumbnail?.url),
            duration: safeNumber(record.lengthSeconds),
            url: safeString(record.videoId)
              ? `${youtube.webBase}/watch?v=${encodeURIComponent(
                  safeString(record.videoId)
                )}&list=${encodeURIComponent(mixId)}`
              : "",
            album: title,
          };
        })
        .filter((entry) => entry.id);

      return {
        collection: {
          id: mixId,
          title,
          count: entries.length,
          source,
          url:
            source === "youtubemusic"
              ? `${youtube.musicBase}/playlist?list=${encodeURIComponent(
                  mixId
                )}`
              : `${youtube.webBase}/playlist?list=${encodeURIComponent(mixId)}`,
          description: "Mix",
        },
        entries,
      };
    } catch (error) {
      errors.push(
        `${instance}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  try {
    return await fetchPipedPlaylist(mixId, source);
  } catch (error) {
    errors.push(
      `piped-playlist-fallback: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  throw new Error(errors.join(" | ") || "Failed to load YouTube mix");
}

async function fetchSoundCloudCollection(
  url: string,
  runId: string
): Promise<CollectionResponse> {
  const providerEndpoints = await getProviderEndpoints();
  const beatseekBase = providerEndpoints.providers.beatseek.apiBase;
  const beatseekUrls = buildProviderUrlCandidates(
    beatseekBase,
    ["/playlist", "/api/playlist"],
    { url }
  );
  // #region debug-point B:soundcloud-collection-fetch-start
  reportDebugEvent(
    runId,
    "B",
    "app/api/collection/route.ts:fetchSoundCloudCollection:start",
    "[DEBUG] fetching SoundCloud collection upstream",
    {
      url,
      beatseekUrl: beatseekUrls[0] || "",
    }
  );
  // #endregion
  const payload = toRecord(await fetchFirstSuccessfulJsonUrl(beatseekUrls));
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
  const blockedResponse = requireStreamifyRequest(request);
  if (blockedResponse) return blockedResponse;

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
    const normalizedSoundCloudUrl =
      source === "soundcloud" ? (url || id || "").trim() : "";

    if (source === "jiosaavn") {
      response = await fetchJioSaavnCollection(id, kind);
    } else if (
      source === "youtube" &&
      kind === "playlist" &&
      normalizedYouTubePlaylistId
    ) {
      response = isYouTubeMixId(normalizedYouTubePlaylistId)
        ? await fetchInvidiousMix(normalizedYouTubePlaylistId, "youtube")
        : await fetchPipedPlaylist(normalizedYouTubePlaylistId, "youtube");
    } else if (
      source === "youtubemusic" &&
      kind === "playlist" &&
      normalizedYouTubePlaylistId
    ) {
      response = isYouTubeMixId(normalizedYouTubePlaylistId)
        ? await fetchInvidiousMix(normalizedYouTubePlaylistId, "youtubemusic")
        : await fetchPipedPlaylist(normalizedYouTubePlaylistId, "youtubemusic");
    } else if (source === "soundcloud" && normalizedSoundCloudUrl) {
      response = await fetchSoundCloudCollection(
        normalizedSoundCloudUrl,
        runId
      );
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
