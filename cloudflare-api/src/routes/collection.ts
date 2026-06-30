import type { WorkerConfig } from "../config";
import { buildProviderUrlCandidates } from "../config";
import {
  absolutizeUrl,
  json,
  toArray,
  toNumber,
  toRecord,
  withTimeout,
} from "../http";

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

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const COLLECTION_FETCH_TIMEOUT_MS = 12000;

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeNumber(value: unknown): number | undefined {
  return toNumber(value);
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
      (left, right) =>
        qualityScore(right.quality || right.size) -
        qualityScore(left.quality || left.size)
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
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, accept: "application/json" },
    cache: "no-store",
    signal: withTimeout(undefined, COLLECTION_FETCH_TIMEOUT_MS),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${text}`.trim());
  }

  return JSON.parse(text.replace(/^\uFEFF/, "").trim() || "null");
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
  config: WorkerConfig,
  id: string,
  kind: "playlist" | "album"
): Promise<CollectionResponse> {
  const endpointCandidates =
    kind === "playlist"
      ? buildProviderUrlCandidates(
          config.providers.jiosaavn.apiBase,
          ["/api/playlists", "/playlists"],
          { id }
        )
      : buildProviderUrlCandidates(
          config.providers.jiosaavn.apiBase,
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
  config: WorkerConfig,
  id: string,
  source: "youtube" | "youtubemusic"
): Promise<CollectionResponse> {
  const playlistId = extractYouTubePlaylistId(id) || id;
  const errors: string[] = [];

  for (const instance of config.instances.piped) {
    try {
      const payload = toRecord(
        await fetchJson(`${instance}/playlists/${encodeURIComponent(playlistId)}`)
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
              ? `${config.providers.youtube.musicBase}/playlist?list=${encodeURIComponent(
                  playlistId
                )}`
              : `${config.providers.youtube.webBase}/playlist?list=${encodeURIComponent(
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
  config: WorkerConfig,
  id: string,
  source: "youtube" | "youtubemusic"
): Promise<CollectionResponse> {
  const mixId = extractYouTubePlaylistId(id) || id;
  const errors: string[] = [];

  for (const instance of config.instances.invidious) {
    try {
      const payload = toRecord(
        await fetchJson(`${instance}/api/v1/mixes/${encodeURIComponent(mixId)}`)
      );
      const title = safeString(payload.title) || "Mix";
      const entries = toArray(payload.videos)
        .map((video, index) => {
          const record = toRecord(video);
          const thumbnails = toArray(record.videoThumbnails)
            .map((entry) => toRecord(entry))
            .sort(
              (left, right) =>
                qualityScore(right.width || right.quality) -
                qualityScore(left.width || left.quality)
            );

          return {
            id: safeString(record.videoId) || `${mixId}-${index}`,
            title: safeString(record.title) || `Track ${index + 1}`,
            subtitle: safeString(record.author),
            artist: safeString(record.author),
            thumbnailUrl: safeString(thumbnails[0]?.url),
            duration: safeNumber(record.lengthSeconds),
            url: safeString(record.videoId)
              ? `${config.providers.youtube.webBase}/watch?v=${encodeURIComponent(
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
              ? `${config.providers.youtube.musicBase}/playlist?list=${encodeURIComponent(
                  mixId
                )}`
              : `${config.providers.youtube.webBase}/playlist?list=${encodeURIComponent(
                  mixId
                )}`,
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
    return await fetchPipedPlaylist(config, mixId, source);
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
  config: WorkerConfig,
  url: string
): Promise<CollectionResponse> {
  const beatseekUrls = buildProviderUrlCandidates(
    config.providers.beatseek.apiBase,
    ["/playlist", "/api/playlist"],
    { url }
  );
  const payload = toRecord(await fetchFirstSuccessfulJsonUrl(beatseekUrls));
  const title = safeString(payload.playlistTitle) || "SoundCloud Collection";
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

  return {
    collection: {
      id: url,
      title,
      thumbnailUrl: pickSoundCloudCollectionImage(payload),
      url: safeString(payload.playlistUrl) || url,
      count: safeNumber(payload.total) || entries.length,
      source: "soundcloud",
    },
    entries,
  };
}

export async function handleCollection(
  request: Request,
  config: WorkerConfig
): Promise<Response> {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get("id");
  const kind = searchParams.get("kind") === "album" ? "album" : "playlist";
  const source = (searchParams.get("source") || "").toLowerCase();
  const url = searchParams.get("url") || "";

  if (!id) {
    return json({ error: "Missing id" }, { status: 400 });
  }

  try {
    let response: CollectionResponse | null = null;
    const normalizedYouTubePlaylistId = extractYouTubePlaylistId(id || url);
    const normalizedSoundCloudUrl =
      source === "soundcloud" ? (url || id || "").trim() : "";

    if (source === "jiosaavn") {
      response = await fetchJioSaavnCollection(config, id, kind);
    } else if (
      source === "youtube" &&
      kind === "playlist" &&
      normalizedYouTubePlaylistId
    ) {
      response = isYouTubeMixId(normalizedYouTubePlaylistId)
        ? await fetchInvidiousMix(config, normalizedYouTubePlaylistId, "youtube")
        : await fetchPipedPlaylist(config, normalizedYouTubePlaylistId, "youtube");
    } else if (
      source === "youtubemusic" &&
      kind === "playlist" &&
      normalizedYouTubePlaylistId
    ) {
      response = isYouTubeMixId(normalizedYouTubePlaylistId)
        ? await fetchInvidiousMix(
            config,
            normalizedYouTubePlaylistId,
            "youtubemusic"
          )
        : await fetchPipedPlaylist(
            config,
            normalizedYouTubePlaylistId,
            "youtubemusic"
          );
    } else if (source === "soundcloud" && normalizedSoundCloudUrl) {
      response = await fetchSoundCloudCollection(config, normalizedSoundCloudUrl);
    }

    if (!response) {
      return json({ error: "Unsupported collection source" }, { status: 400 });
    }

    return json(response, { status: 200 });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load collection",
      },
      { status: 500 }
    );
  }
}
