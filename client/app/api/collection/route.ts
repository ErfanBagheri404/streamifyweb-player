import { NextRequest, NextResponse } from "next/server";
import { publicJsonCacheHeaders } from "../_lib/cache-headers";
import { requireStreamifyRequest } from "../_lib/request-guard";
import { fetchSpotifyTrackCovers } from "../_lib/spotify-lookup";
import {
  getInvidiousInstances,
  getPipedInstances,
} from "../../lib/media-providers";
import {
  buildProviderUrlCandidates,
  getCachedProviderEndpointsSnapshot,
  getProviderEndpoints,
} from "../../lib/provider-endpoints";
import { normalizeYouTubeThumbnailUrl } from "../../lib/youtube-thumbnails";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const COLLECTION_FETCH_TIMEOUT_MS = 12000;

// Config host can be unreachable/forbidden; providers still work off the
// last-known (or built-in) endpoints snapshot, same as the search route.
async function resolveProviderEndpoints() {
  try {
    return await getProviderEndpoints();
  } catch {
    return getCachedProviderEndpointsSnapshot();
  }
}

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
      (/fetch failed|aborted|ECONNRESET|UND_ERR_CONNECT_TIMEOUT|connection was closed|TLS|certificate/i.test(
        message
      ) ||
        message.includes("This operation was aborted"));

    if (!shouldTryPowerShell) {
      throw error;
    }

    const escapedUrl = url.replace(/'/g, "''");
    const escapedUserAgent = USER_AGENT.replace(/'/g, "''");
    // This host has no direct route to several provider APIs (Deezer,
    // SoundCloud, YouTube) — only a local HTTP proxy does. Node's fetch ignores
    // the system proxy, so the PowerShell fallback has to pass it explicitly.
    const proxyUrl = (process.env.YT_PROXY_URL || "").trim();
    const proxyArg = /^https?:\/\//i.test(proxyUrl)
      ? ` -Proxy '${proxyUrl.replace(/'/g, "''")}'`
      : "";
    const script = [
      "$ProgressPreference = 'SilentlyContinue'",
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
      `$headers = @{ 'User-Agent' = '${escapedUserAgent}'; 'Accept' = 'application/json, text/plain;q=0.9, */*;q=0.8' }`,
      `$response = Invoke-RestMethod -Uri '${escapedUrl}' -Headers $headers -TimeoutSec ${Math.max(
        1,
        Math.ceil(COLLECTION_FETCH_TIMEOUT_MS / 1000)
      )}${proxyArg}`,
      "$response | ConvertTo-Json -Depth 100 -Compress",
    ].join("; ");

    // Windows-local-only fallback (guarded by process.platform above). Loaded
    // lazily so node:child_process stays out of the Vercel cold-start path.
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { stdout } = await promisify(execFile)(
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
  const providerEndpoints = await resolveProviderEndpoints();
  // The renderer passes either the numeric id or a share token. The saavn API
  // answers `id=` with the NUMERIC id only; share tokens (featured/album links,
  // whose slug token is NOT the id) resolve through `link=` instead. Both
  // shapes return the same payload, and `limit` lifts the default 10-song page.
  const trimmed = id.trim();
  const numericId =
    trimmed.match(/\/(\d{6,})\/?(?:[?#]|$)/)?.[1] ||
    (!trimmed.includes("/") && /^\d+$/.test(trimmed) ? trimmed : "");
  const params = numericId
    ? { id: numericId, limit: 500 }
    : {
        limit: 500,
        link: /^https?:\/\//i.test(trimmed)
          ? trimmed
          : `https://www.jiosaavn.com/featured/x/${trimmed}`,
      };
  const endpointCandidates =
    kind === "playlist"
      ? buildProviderUrlCandidates(
          providerEndpoints.providers.jiosaavn.apiBase,
          ["/api/playlists", "/playlists"],
          params
        )
      : buildProviderUrlCandidates(
          providerEndpoints.providers.jiosaavn.apiBase,
          ["/api/albums", "/albums"],
          params
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
  const providerEndpoints = await resolveProviderEndpoints();
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
            thumbnailUrl: normalizeYouTubeThumbnailUrl({
              url: safeString(record.thumbnail),
              videoId,
            }),
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
          thumbnailUrl: normalizeYouTubeThumbnailUrl({
            url: safeString(payload.thumbnailUrl),
          }),
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
  const providerEndpoints = await resolveProviderEndpoints();
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
            thumbnailUrl: normalizeYouTubeThumbnailUrl({
              url: safeString(thumbnail?.url),
              videoId: safeString(record.videoId),
            }),
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
  const providerEndpoints = await resolveProviderEndpoints();
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

const SPOTIFY_EMBED_BASE = "https://open.spotify.com";

function extractSpotifyCollectionId(value: string): string {
  const raw = value.trim();
  if (!raw) return "";

  const typeMatch = raw.match(
    /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]{10,})/i
  );
  if (typeMatch?.[2]) return typeMatch[2];

  const queryMatch = raw.match(/[?&](?:list|album|track)=([A-Za-z0-9]{10,})/i);
  if (queryMatch?.[1]) return queryMatch[1];

  const uriMatch = raw.match(
    /spotify:(?:track|album|playlist):([A-Za-z0-9]{10,})/i
  );
  if (uriMatch?.[1]) return uriMatch[1];

  return /^[A-Za-z0-9]{10,}$/.test(raw) ? raw : "";
}

function pickSpotifyCollectionKind(value: string): "playlist" | "album" | "track" {
  const raw = value.toLowerCase();
  if (raw.includes("/album/") || raw.includes("spotify:album:")) return "album";
  if (raw.includes("/track/") || raw.includes("spotify:track:")) return "track";
  return "playlist";
}

async function fetchSpotifyCollection(
  rawInput: string,
  kindHint: "playlist" | "album"
): Promise<CollectionResponse> {
  const id = extractSpotifyCollectionId(rawInput);
  if (!id) throw new Error("Missing or invalid Spotify id");

  const kind =
    kindHint === "album" ? "album" : pickSpotifyCollectionKind(rawInput);
  const response = await fetch(
    `${SPOTIFY_EMBED_BASE}/embed/${kind}/${encodeURIComponent(id)}`,
    {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(COLLECTION_FETCH_TIMEOUT_MS),
    }
  );
  if (!response.ok) {
    throw new Error(`Spotify embed HTTP ${response.status}`);
  }

  const html = await response.text();
  const nextData = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!nextData?.[1]) {
    throw new Error("Spotify embed returned no data");
  }

  const parsed = toRecord(
    toRecord(
      toRecord(toRecord(JSON.parse(nextData[1])).props as Record<string, unknown>)
        .pageProps as Record<string, unknown>
    ).state as Record<string, unknown>
  );
  const entity = toRecord(toRecord(parsed.data).entity);
  const title = safeString(entity.name) || "Spotify Playlist";
  const coverArt = safeString(
    toArray(toRecord(entity.coverArt).sources)
      .map((source) => safeString(toRecord(source).url))
      .find(Boolean)
  );
  const author =
    safeString(entity.subtitle) ||
    toArray(entity.authors)
      .map((entry) => safeString(toRecord(entry).name))
      .filter(Boolean)
      .join(", ");

  const entries = toArray(entity.trackList)
    .map((track) => {
      const record = toRecord(track);
      const trackId = safeString(record.uri).split(":").pop() || "";
      const trackTitle = safeString(record.title);
      if (!trackId || !trackTitle) return null;

      const artist = safeString(record.subtitle);
      const durationMs = safeNumber(record.duration);
      return {
        id: trackId,
        title: trackTitle,
        subtitle: artist,
        artist,
        // Filled in below: the embed payload carries NO per-track artwork, so
        // every row would otherwise show the playlist cover.
        thumbnailUrl: undefined as string | undefined,
        duration:
          durationMs != null && durationMs > 0
            ? Math.round(durationMs / 1000)
            : undefined,
        url: `${SPOTIFY_EMBED_BASE}/track/${trackId}`,
        album: title,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (!entries.length) {
    throw new Error("Spotify collection returned no playable tracks");
  }

  // Per-track cover art. The embed HTML has none, so resolve each track's own
  // album through the keyless partner lookup. Failure is non-fatal — rows
  // keep the collection cover rather than the whole import failing.
  try {
    const covers = await fetchSpotifyTrackCovers(
      entries.map((entry) => entry.id)
    );
    for (const entry of entries) {
      entry.thumbnailUrl = covers.get(entry.id) || coverArt || undefined;
    }
  } catch {
    for (const entry of entries) {
      entry.thumbnailUrl = coverArt || undefined;
    }
  }

  return {
    collection: {
      id,
      title,
      author,
      thumbnailUrl: coverArt,
      url: `${SPOTIFY_EMBED_BASE}/${kind}/${id}`,
      count: entries.length,
      source: "spotify",
    },
    entries,
  };
}

// ---- YouTube / YouTube Music via Innertube browse -------------------------
// Public Piped instances are dead (the config lists one, it 500s), so the
// playlist import path uses the same keyless Innertube browse the mobile app
// ships: WEB/WEB_REMIX browse on the VL-prefixed playlist id.

// ponytail: one client for both kinds. Plain WEB browse answers a playlist id
// with `lockupViewModel` rows, while WEB_REMIX answers the same VL id with
// `musicResponsiveListItemRenderer` rows — the shape the parser below reads. A
// second parser for lockups only pays off if the plain-WEB rows are needed for
// something WEB_REMIX cannot express.
const YT_IMPORT_CLIENTS = {
  youtube: {
    name: "WEB_REMIX",
    version: "1.20250908.01.00",
    clientNameHeader: "67",
    origin: "https://music.youtube.com",
  },
  youtubemusic: {
    name: "WEB_REMIX",
    version: "1.20250908.01.00",
    clientNameHeader: "67",
    origin: "https://music.youtube.com",
  },
} as const;

const YT_IMPORT_MAX_PAGES = 20;

function ytFindFirst(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const hit = ytFindFirst(entry, key);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (key in record) return record[key];
    for (const entry of Object.values(record)) {
      const hit = ytFindFirst(entry, key);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

function ytCollectByKey(value: unknown, key: string, out: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const entry of value) ytCollectByKey(entry, key, out);
    return out;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (key in record) {
      out.push(record[key]);
      return out;
    }
    for (const entry of Object.values(record)) ytCollectByKey(entry, key, out);
  }
  return out;
}

function ytRunsToText(runs: unknown): string {
  if (!Array.isArray(runs)) return "";
  return runs
    .map((run) => (run && typeof run === "object" ? String((run as Record<string, unknown>).text ?? "") : ""))
    .join("")
    .trim();
}

function ytThumbnailUrl(thumbnail: unknown): string {
  const thumbs = ytFindFirst(thumbnail, "thumbnails");
  if (!Array.isArray(thumbs) || !thumbs.length) return "";
  const last = thumbs[thumbs.length - 1] as Record<string, unknown>;
  return typeof last?.url === "string" ? last.url : "";
}

function ytParseClockDuration(value: string): number {
  const trimmed = (value || "").trim();
  if (!trimmed || !/^\d+(:\d{1,2})+$/.test(trimmed)) return 0;
  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function ytParseListItem(item: unknown) {
  if (!item || typeof item !== "object") return null;
  const renderer = item as Record<string, any>;
  let videoId = "";
  let title = "";
  let artist = "";
  let duration = 0;
  let columnIndex = 0;

  for (const column of renderer.flexColumns || []) {
    const columnRenderer = column?.musicResponsiveListItemFlexColumnRenderer;
    const text = ytRunsToText(columnRenderer?.text?.runs);
    if (text) {
      if (columnIndex === 0) title = text;
      else if (!artist) artist = text;
    }
    columnIndex += 1;
    for (const run of columnRenderer?.text?.runs || []) {
      const endpointVideoId = run?.navigationEndpoint?.watchEndpoint?.videoId;
      if (!videoId && typeof endpointVideoId === "string") {
        videoId = endpointVideoId;
      }
    }
  }

  if (!videoId) {
    const overlayVideoId = ytFindFirst(renderer.overlay, "videoId");
    if (typeof overlayVideoId === "string") videoId = overlayVideoId;
  }

  if (!videoId) {
    // Playlist rows (playlistBrowse) carry the id on playlistItemData, not on
    // the title's run endpoint.
    const dataVideoId = ytFindFirst(renderer, "videoId");
    if (typeof dataVideoId === "string") videoId = dataVideoId;
  }

  for (const column of renderer.fixedColumns || []) {
    const text = ytRunsToText(
      column?.musicResponsiveListItemFixedColumnRenderer?.text?.runs,
    );
    const seconds = ytParseClockDuration(text);
    if (seconds > 0) {
      duration = seconds;
      break;
    }
  }

  if (!videoId || !title) return null;
  return { videoId, title, artist, duration, thumbnail: ytThumbnailUrl(renderer.thumbnail) };
}

async function ytPostBrowse(
  kind: "youtube" | "youtubemusic",
  body: Record<string, unknown>,
): Promise<unknown> {
  const client = YT_IMPORT_CLIENTS[kind];
  const url = `${client.origin}/youtubei/v1/browse?prettyPrint=false`;
  const payload = {
    // browseId/continuation must be siblings of `context`, not inside it —
    // spreading them into context returns the home feed instead.
    context: {
      client: {
        clientName: client.name,
        clientVersion: client.version,
        hl: "en",
        gl: "US",
      },
    },
    ...body,
  };
  const jsonBody = JSON.stringify(payload);

  const proxyUrl = (process.env.YT_PROXY_URL || "").trim();
  const usePowerShell = process.platform === "win32" && !!proxyUrl;

  if (!usePowerShell) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
          "X-YouTube-Client-Name": client.clientNameHeader,
          "X-YouTube-Client-Version": client.version,
          Origin: client.origin,
          Referer: `${client.origin}/`,
        },
        body: jsonBody,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // Windows-local path: route through the configured proxy via PowerShell
  // because Node's fetch ignores the system proxy.
  const escapedUrl = url.replace(/'/g, "''");
  const escapedBody = jsonBody.replace(/'/g, "''");
  const proxyArg = ` -Proxy '${proxyUrl.replace(/'/g, "''")}'`;
  const script = [
    "$ProgressPreference = 'SilentlyContinue'",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    `$headers = @{ 'Content-Type' = 'application/json'; 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'; 'X-YouTube-Client-Name' = '${client.clientNameHeader}'; 'X-YouTube-Client-Version' = '${client.version}'; 'Origin' = '${client.origin}'; 'Referer' = '${client.origin}/' }`,
    `$response = Invoke-RestMethod -Uri '${escapedUrl}' -Method POST -Headers $headers -Body '${escapedBody}' -TimeoutSec 20${proxyArg}`,
    "$response | ConvertTo-Json -Depth 100 -Compress",
  ].join("; ");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { stdout } = await promisify(execFile)(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  return JSON.parse(stdout.trim() || "null");
}

async function fetchYouTubeInnertubeCollection(
  playlistId: string,
  kind: "youtube" | "youtubemusic",
): Promise<CollectionResponse> {
  const browseId = playlistId.startsWith("VL") ? playlistId : `VL${playlistId}`;
  const entries: CollectionResponse["entries"] = [];
  let name = "";
  let owner = "";
  let thumbnail = "";
  let continuation = "";
  let pages = 0;

  do {
    if (pages >= YT_IMPORT_MAX_PAGES) break;
    const payload = await ytPostBrowse(kind, continuation ? { continuation } : { browseId });
    for (const rawItem of ytCollectByKey(payload, "musicResponsiveListItemRenderer")) {
      const parsed = ytParseListItem(rawItem);
      if (!parsed) continue;
      entries.push({
        id: `youtube:video:${parsed.videoId}`,
        title: parsed.title,
        subtitle: parsed.artist || undefined,
        duration: parsed.duration || undefined,
        artist: parsed.artist || undefined,
        thumbnailUrl: parsed.thumbnail || undefined,
        url: `https://www.youtube.com/watch?v=${parsed.videoId}`,
      });
    }
    if (!name) {
      const header = ytFindFirst(payload, "musicResponsiveHeaderRenderer") as
        | Record<string, any>
        | undefined;
      name = header ? ytRunsToText(header.title?.runs) : "";
      owner = header
        ? (header.subtitle?.runs ?? [])
            .map((run: any) => String(run?.text ?? "").trim())
            .filter((text: string) => text && text !== "\u2022")
            .join(" ")
            .trim()
        : "";
      thumbnail = header ? ytThumbnailUrl(header.thumbnail) : "";
    }
    const command = ytFindFirst(payload, "continuationCommand");
    continuation =
      command && typeof command === "object"
        ? String((command as Record<string, unknown>).token ?? "")
        : "";
    pages += 1;
  } while (continuation);

  if (!entries.length) {
    throw new Error("The YouTube playlist returned no tracks.");
  }

  return {
    collection: {
      id: playlistId,
      title: name || "YouTube playlist",
      author: owner || undefined,
      thumbnailUrl: thumbnail || undefined,
      url: `https://www.youtube.com/playlist?list=${playlistId}`,
      count: entries.length,
      source: kind,
    },
    entries,
  };
}

async function fetchDeezerCollection(
  id: string,
  kind: string,
): Promise<CollectionResponse> {
  const numericId = id.includes("/")
    ? id.match(/(playlist|album)\/(\d+)/)?.[2] || id.match(/(\d+)/)?.[1] || id
    : id.replace(/^deezer:(playlist|album):/i, "");
  const isAlbum = kind === "album";
  const metaUrl = `https://api.deezer.com/${isAlbum ? "album" : "playlist"}/${encodeURIComponent(numericId)}`;
  const meta = toRecord(await fetchJson(metaUrl));
  let rawTracks = isAlbum
    ? toArray(toRecord(meta.tracks).data)
    : toArray(meta.data);
  if (!isAlbum && rawTracks.length === 0) {
    // deezer playlist meta omits tracks; page the tracks endpoint
    let index = 0;
    for (let page = 0; page < 5; page += 1) {
      const chunk = toRecord(
        await fetchJson(`${metaUrl}/tracks?index=${index}&limit=100`)
      );
      const data = toArray(chunk.data);
      if (!data.length) break;
      rawTracks = rawTracks.concat(data);
      index += data.length;
      if (!chunk.next) break;
    }
  }
  const tracks = rawTracks.map((entry) => toRecord(entry));

  const entries = tracks
    .filter((track) => safeString(track.preview))
    .map((track) => {
      const artist = toRecord(track.artist);
      const album = toRecord(track.album);
      const preview = safeString(track.preview);
      return {
        id: `deezer:track:${track.id}`,
        title: safeString(track.title),
        name: safeString(track.title),
        type: "song",
        duration: normalizeDurationSeconds(track.duration) ?? 0,
        artists: [{ name: safeString(artist.name) }],
        primaryArtists: safeString(artist.name)
          ? [{ id: String(artist.id ?? ""), name: safeString(artist.name) }]
          : [],
        artist: safeString(artist.name),
        album: safeString(album.title),
        image: safeString(album.cover_xl) || safeString(album.cover_big),
        thumbnailUrl: safeString(album.cover_xl) || safeString(album.cover_big),
        url: safeString(track.link),
        previewUrl: preview,
        downloadUrl: [{ url: preview }],
        explicit: Boolean(track.explicit_lyrics),
      };
    });

  if (!entries.length) {
    throw new Error("The Deezer collection has no previewable tracks.");
  }

  return {
    collection: {
      id: `deezer:${isAlbum ? "album" : "playlist"}:${numericId}`,
      title: safeString(meta.title) || "Deezer " + kind,
      author: safeString(toRecord(meta.user).name) || undefined,
      description: safeString(meta.description) || null,
      thumbnailUrl:
        safeString(meta.cover_xl) || safeString(meta.cover_big) || "",
      url: safeString(meta.link),
      count: safeNumber(meta.nb_tracks) ?? entries.length,
      source: "deezer",
    },
    entries,
  };
}

async function fetchItunesCollection(
  id: string,
  kind: string,
): Promise<CollectionResponse> {
  const numericId = id.includes("/")
    ? id.match(/(\d+)(?:\?|$|\/[^/]*$)/)?.[1] || id.replace(/\D+/g, "") || id
    : id.replace(/^itunes:(playlist|album):/i, "");
  const lookupUrl = `https://itunes.apple.com/lookup?id=${encodeURIComponent(numericId)}&entity=song&limit=200`;
  const payload = toRecord(await fetchJson(lookupUrl));
  const results = toArray(payload.results).map((entry) => toRecord(entry));
  const meta = results.find((entry) => safeString(entry.kind) === "album") || {};
  const songs = results.filter((entry) => safeString(entry.kind) === "song");

  const entries = songs
    .filter((song) => safeString(song.previewUrl))
    .map((song) => {
      const preview = safeString(song.previewUrl);
      return {
        id: `itunes:track:${song.trackId}`,
        title: safeString(song.trackName),
        name: safeString(song.trackName),
        type: "song",
        duration: Math.floor((safeNumber(song.trackTimeMillis) ?? 0) / 1000),
        artists: [{ name: safeString(song.artistName) }],
        primaryArtists: safeString(song.artistName)
          ? [{ id: "", name: safeString(song.artistName) }]
          : [],
        artist: safeString(song.artistName),
        album: safeString(song.collectionName),
        image: safeString(song.artworkUrl100).replace(/\/\d+x\d+bb/, "/600x600bb"),
        thumbnailUrl: safeString(song.artworkUrl100).replace(/\/\d+x\d+bb/, "/600x600bb"),
        url: safeString(song.trackViewUrl),
        previewUrl: preview,
        downloadUrl: [{ url: preview }],
        explicit: false,
      };
    });

  if (!entries.length) {
    throw new Error("The iTunes collection has no previewable tracks.");
  }

  const coverArt = safeString(meta.artworkUrl100).replace(/\/\d+x\d+bb/, "/600x600bb");
  return {
    collection: {
      id: `itunes:album:${numericId}`,
      title: safeString(meta.collectionName) || safeString(songs[0]?.collectionName) || "iTunes " + kind,
      author: safeString(meta.artistName) || undefined,
      description: null,
      thumbnailUrl: coverArt,
      url: safeString(meta.collectionViewUrl),
      count: safeNumber(meta.trackCount) ?? entries.length,
      source: "itunes",
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
      response = await fetchYouTubeInnertubeCollection(
        normalizedYouTubePlaylistId,
        "youtube"
      );
    } else if (
      source === "youtubemusic" &&
      kind === "playlist" &&
      normalizedYouTubePlaylistId
    ) {
      response = await fetchYouTubeInnertubeCollection(
        normalizedYouTubePlaylistId,
        "youtubemusic"
      );
    } else if (source === "soundcloud" && normalizedSoundCloudUrl) {
      response = await fetchSoundCloudCollection(
        normalizedSoundCloudUrl,
        runId
      );
    } else if (source === "spotify") {
      response = await fetchSpotifyCollection(id || url, kind);
    } else if (source === "deezer") {
      response = await fetchDeezerCollection(id || url, kind);
    } else if (source === "itunes") {
      response = await fetchItunesCollection(id || url, kind);
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

    return NextResponse.json(response, {
      headers: publicJsonCacheHeaders(60),
    });
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
