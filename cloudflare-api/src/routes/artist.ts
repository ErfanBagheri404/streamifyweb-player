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

type ArtistPayload = {
  artist: {
    id: string;
    name: string;
    image?: string;
    banner?: string;
    subscribers?: number;
    verified?: boolean;
    description?: string;
    source?: string;
    url?: string;
  };
  songs: Array<{
    id: string;
    title: string;
    thumbnail?: string;
    views?: number;
    duration?: number;
    artist?: string;
    url?: string;
  }>;
  albums: Array<{
    id: string;
    title: string;
    thumbnail?: string;
    year?: string;
    videoCount?: number;
    songCount?: number;
    url?: string;
  }>;
  playlists: Array<{
    id: string;
    title: string;
    thumbnail?: string;
    videoCount?: number;
  }>;
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const ARTIST_FETCH_TIMEOUT_MS = 6000;

function isYouTubeChannelId(id: string): boolean {
  return id.startsWith("UC") || id.startsWith("U") || id.length === 24;
}

function normalizeYouTubeChannelId(value: string): string {
  const rawValue = value.trim();
  if (!rawValue) return "";

  if (/^https?:\/\//i.test(rawValue)) {
    try {
      const parsed = new URL(rawValue);
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments[0] === "channel" && segments[1]) {
        return segments[1];
      }
    } catch {}
  }

  const normalized = rawValue.replace(/^\/+/, "");
  const channelMatch = normalized.match(/^channel\/([^/?#]+)/i);
  if (channelMatch?.[1]) return channelMatch[1];

  return normalized;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeNumber(value: unknown): number {
  const numeric = toNumber(value);
  return numeric == null ? 0 : numeric;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, accept: "application/json" },
    cache: "no-store",
    signal: withTimeout(undefined, ARTIST_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} ${text}`.trim());
  }

  return response.json() as Promise<unknown>;
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

async function fetchFirstSuccessfulInvidiousJson(
  instances: string[],
  buildUrl: (instance: string) => string
): Promise<unknown> {
  const errors: string[] = [];

  for (const instance of instances) {
    try {
      return await fetchJson(buildUrl(instance));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors.join(" | ") || "All Invidious requests failed");
}

function qualityScore(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/(\d+)/);
    if (match) return Number(match[1]);
  }
  return 0;
}

function pickBestImageUrl(
  arr: unknown,
  invidiousBase: string,
  urlKey = "url"
): string {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  const sorted = [...arr]
    .map((value) => toRecord(value))
    .sort((left, right) => safeNumber(right.width) - safeNumber(left.width));
  const url = safeString(sorted[0]?.[urlKey]);
  return absolutizeUrl(url, invidiousBase);
}

function pickJioSaavnImage(arr: unknown): string {
  const sorted = toArray(arr)
    .map((entry) => toRecord(entry))
    .sort(
      (left, right) =>
        qualityScore(right.quality || right.size) -
        qualityScore(left.quality || left.size)
    );

  for (const image of sorted) {
    const url = safeString(image.url || image.link);
    if (url) return url;
  }

  return "";
}

function pickJioSaavnArtistNames(value: unknown): string {
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

function normalizeJioSaavnSong(song: unknown): ArtistPayload["songs"][number] {
  const record = toRecord(song);
  return {
    id: safeString(record.id || record.songid || record.url),
    title: safeString(record.name || record.title || record.song) || "Unknown",
    thumbnail: pickJioSaavnImage(record.image),
    duration: safeNumber(record.duration),
    artist: pickJioSaavnArtistNames(record.artists),
    url: safeString(record.url),
  };
}

function normalizeJioSaavnAlbum(
  album: unknown
): ArtistPayload["albums"][number] {
  const record = toRecord(album);
  return {
    id: safeString(record.id || record.url),
    title: safeString(record.name || record.title) || "Unknown",
    thumbnail: pickJioSaavnImage(record.image),
    year: safeString(record.year),
    videoCount: safeNumber(record.songCount),
    songCount: safeNumber(record.songCount),
    url: safeString(record.url),
  };
}

async function fetchJioSaavnArtist(
  config: WorkerConfig,
  id: string
): Promise<ArtistPayload> {
  const [artistPayload, songsPayload, albumsPayload] = await Promise.all([
    fetchFirstSuccessfulJsonUrl(
      buildProviderUrlCandidates(config.providers.jiosaavn.apiBase, [
        `/api/artists/${encodeURIComponent(id)}`,
        `/artists/${encodeURIComponent(id)}`,
      ])
    ),
    fetchFirstSuccessfulJsonUrl(
      buildProviderUrlCandidates(config.providers.jiosaavn.apiBase, [
        `/api/artists/${encodeURIComponent(id)}/songs`,
        `/artists/${encodeURIComponent(id)}/songs`,
      ])
    ).catch(() => null),
    fetchFirstSuccessfulJsonUrl(
      buildProviderUrlCandidates(config.providers.jiosaavn.apiBase, [
        `/api/artists/${encodeURIComponent(id)}/albums`,
        `/artists/${encodeURIComponent(id)}/albums`,
      ])
    ).catch(() => null),
  ]);

  const artistData = toRecord(toRecord(artistPayload).data);
  const songsData = toRecord(toRecord(songsPayload).data);
  const albumsData = toRecord(toRecord(albumsPayload).data);

  const artist: ArtistPayload["artist"] = {
    id: safeString(artistData.id || id),
    name: safeString(artistData.name) || "Artist",
    image: pickJioSaavnImage(artistData.image),
    banner: pickJioSaavnImage(artistData.image),
    subscribers:
      safeNumber(artistData.followerCount) || safeNumber(artistData.fanCount),
    verified: Boolean(artistData.isVerified),
    description:
      safeString(artistData.dominantType) ||
      toArray(artistData.bio)
        .map((entry) => safeString(toRecord(entry).text || entry))
        .filter(Boolean)
        .join(" "),
    source: "jiosaavn",
    url: safeString(artistData.url),
  };

  const songsFromEndpoint = toArray(songsData.songs).map((song) =>
    normalizeJioSaavnSong(song)
  );
  const songs =
    songsFromEndpoint.length > 0
      ? songsFromEndpoint
      : toArray(artistData.topSongs).map((song) => normalizeJioSaavnSong(song));
  const albums = toArray(albumsData.albums).map((album) =>
    normalizeJioSaavnAlbum(album)
  );

  return {
    artist,
    songs: songs.filter((song) => song.id),
    albums: albums.filter((album) => album.id),
    playlists: [],
  };
}

export async function handleArtist(
  request: Request,
  config: WorkerConfig
): Promise<Response> {
  const searchParams = new URL(request.url).searchParams;
  const rawId = searchParams.get("id");
  const source = (searchParams.get("source") || "").toLowerCase();
  if (!rawId) {
    return json({ error: "Missing id" }, { status: 400 });
  }

  const id =
    source === "jiosaavn" ? rawId : normalizeYouTubeChannelId(rawId) || rawId;

  if (source === "jiosaavn") {
    try {
      return json(await fetchJioSaavnArtist(config, id), { status: 200 });
    } catch {
      return json({ error: "Failed to load artist" }, { status: 500 });
    }
  }

  if (!isYouTubeChannelId(id)) {
    return json(
      {
        artist: { id, name: id },
        songs: [],
        albums: [],
        playlists: [],
      } satisfies ArtistPayload,
      { status: 200 }
    );
  }

  try {
    const [channelResult, videosResult, playlistsResult] = await Promise.all([
      fetchFirstSuccessfulInvidiousJson(
        config.instances.invidious,
        (instance) =>
          `${instance}/api/v1/channels/${encodeURIComponent(id)}`
      ).catch(() => null),
      fetchFirstSuccessfulInvidiousJson(
        config.instances.invidious,
        (instance) =>
          `${instance}/api/v1/channels/${encodeURIComponent(id)}/videos`
      ).catch(() => []),
      fetchFirstSuccessfulInvidiousJson(
        config.instances.invidious,
        (instance) =>
          `${instance}/api/v1/channels/${encodeURIComponent(id)}/playlists`
      ).catch(() => []),
    ]);

    const invidiousChannel = toRecord(channelResult);
    const invidiousBase = config.instances.invidious[0] || "";
    const latestVideos = Array.isArray(invidiousChannel.latestVideos)
      ? (invidiousChannel.latestVideos as Array<Record<string, unknown>>)
      : [];
    const videosFallback = Array.isArray(videosResult)
      ? (videosResult as Array<Record<string, unknown>>)
      : toArray(toRecord(videosResult).videos).map((entry) => toRecord(entry));
    const videosToUse = latestVideos.length > 0 ? latestVideos : videosFallback;

    if (!Object.keys(invidiousChannel).length && videosToUse.length === 0) {
      throw new Error("Failed to load artist");
    }

    const nameRaw =
      safeString(invidiousChannel.author) || safeString(invidiousChannel.name);
    const name =
      nameRaw.replace(/\s*-\s*Topic$/i, "") ||
      safeString(videosToUse[0]?.author).replace(/\s*-\s*Topic$/i, "") ||
      "Artist";

    const artist: ArtistPayload["artist"] = {
      id,
      name,
      image: pickBestImageUrl(invidiousChannel.authorThumbnails, invidiousBase),
      banner: pickBestImageUrl(invidiousChannel.authorBanners, invidiousBase),
      subscribers: safeNumber(invidiousChannel.subCount),
      verified: Boolean(invidiousChannel.verified),
      description: safeString(invidiousChannel.description),
      source: "youtube",
      url: `${config.providers.youtube.webBase}/channel/${encodeURIComponent(id)}`,
    };

    const songs = videosToUse.map((video) => {
      const thumbnails = video.videoThumbnails;
      return {
        id: safeString(video.videoId) || safeString(video.id),
        title: safeString(video.title) || "Unknown",
        thumbnail: pickBestImageUrl(thumbnails, invidiousBase),
        views: safeNumber(video.viewCount),
        duration: safeNumber(video.lengthSeconds),
      };
    });

    const playlistsList = Array.isArray(playlistsResult)
      ? (playlistsResult as Array<Record<string, unknown>>)
      : toArray(toRecord(playlistsResult).playlists).map((entry) =>
          toRecord(entry)
        );

    const albums: ArtistPayload["albums"] = [];
    const playlists: ArtistPayload["playlists"] = [];

    for (const playlist of playlistsList) {
      const playlistId = safeString(playlist.playlistId) || safeString(playlist.id);
      const payload = {
        id: playlistId,
        title: safeString(playlist.title) || "Unknown",
        thumbnail: absolutizeUrl(
          safeString(playlist.playlistThumbnail),
          invidiousBase
        ),
        videoCount: safeNumber(playlist.videoCount),
      };

      if (playlistId.startsWith("OLAK5uy") || playlistId.startsWith("MPREb_")) {
        albums.push(payload);
      } else {
        playlists.push(payload);
      }
    }

    return json(
      {
        artist,
        songs,
        albums,
        playlists,
      } satisfies ArtistPayload,
      { status: 200 }
    );
  } catch {
    return json({ error: "Failed to load artist" }, { status: 500 });
  }
}
