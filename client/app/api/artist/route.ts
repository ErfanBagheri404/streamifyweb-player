import { NextRequest, NextResponse } from "next/server";
import { requireStreamifyRequest } from "../_lib/request-guard";
import { getInvidiousInstances } from "../../lib/media-providers";
import {
  buildProviderUrlCandidates,
  getProviderEndpoints,
} from "../../lib/provider-endpoints";

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
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function toRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function toArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ARTIST_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${text}`);
    }

    return res.json() as Promise<unknown>;
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

async function fetchFirstSuccessfulJson(
  buildUrl: (instance: string) => string
): Promise<unknown> {
  const errors: string[] = [];

  for (const instance of await getInvidiousInstances()) {
    try {
      return await fetchJson(buildUrl(instance));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors.join(" | ") || "All Invidious requests failed");
}

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

async function fetchInvidiousChannel(channelId: string): Promise<unknown> {
  return fetchFirstSuccessfulJson(
    (instance) => `${instance}/api/v1/channels/${encodeURIComponent(channelId)}`
  );
}

async function fetchInvidiousChannelVideos(
  channelId: string
): Promise<unknown> {
  const payload = await fetchFirstSuccessfulJson(
    (instance) =>
      `${instance}/api/v1/channels/${encodeURIComponent(channelId)}/videos`
  );
  return Array.isArray(payload) ? payload : toArray(toRecord(payload).videos);
}

async function fetchInvidiousChannelPlaylists(
  channelId: string
): Promise<unknown> {
  const payload = await fetchFirstSuccessfulJson(
    (instance) =>
      `${instance}/api/v1/channels/${encodeURIComponent(channelId)}/playlists`
  );
  return Array.isArray(payload)
    ? payload
    : toArray(toRecord(payload).playlists);
}

function absolutizeUrl(url: string, invidiousBase: string): string {
  if (!url) return url;
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${invidiousBase}${url}`;
  return url;
}

function buildInvidiousImageProxyUrl(url: string): string {
  if (!url) return "";
  return `/api/invidious-image?url=${encodeURIComponent(url)}`;
}

function pickBestImageUrl(
  arr: unknown,
  invidiousBase: string,
  urlKey: string = "url"
): string {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  const sorted = [...arr]
    .map((x) => x as Record<string, unknown>)
    .sort((a, b) => safeNumber(b.width) - safeNumber(a.width));
  const url = safeString(sorted[0]?.[urlKey]);
  return absolutizeUrl(url, invidiousBase);
}

function qualityScore(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/(\d+)/);
    if (match) return Number(match[1]);
  }
  return 0;
}

function pickJioSaavnImage(arr: unknown): string {
  const sorted = toArray(arr)
    .map((entry) => toRecord(entry))
    .sort(
      (a, b) =>
        qualityScore(b.quality || b.size) - qualityScore(a.quality || a.size)
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

async function fetchJioSaavnArtist(id: string): Promise<ArtistPayload> {
  const providerEndpoints = await getProviderEndpoints();
  const jiosaavnApiBase = providerEndpoints.providers.jiosaavn.apiBase;
  const [artistPayload, songsPayload, albumsPayload] = await Promise.all([
    fetchFirstSuccessfulJsonUrl(
      buildProviderUrlCandidates(jiosaavnApiBase, [
        `/api/artists/${encodeURIComponent(id)}`,
        `/artists/${encodeURIComponent(id)}`,
      ])
    ),
    fetchFirstSuccessfulJsonUrl(
      buildProviderUrlCandidates(jiosaavnApiBase, [
        `/api/artists/${encodeURIComponent(id)}/songs`,
        `/artists/${encodeURIComponent(id)}/songs`,
      ])
    ).catch(() => null),
    fetchFirstSuccessfulJsonUrl(
      buildProviderUrlCandidates(jiosaavnApiBase, [
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

function isAutoGeneratedAlbumPlaylistId(playlistId: string): boolean {
  return playlistId.startsWith("OLAK5uy") || playlistId.startsWith("MPREb_");
}

export async function GET(request: NextRequest) {
  const blockedResponse = requireStreamifyRequest(request);
  if (blockedResponse) return blockedResponse;

  const searchParams = request.nextUrl.searchParams;
  const rawId = searchParams.get("id");
  const source = (searchParams.get("source") || "").toLowerCase();
  if (!rawId)
    return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const id =
    source === "jiosaavn" ? rawId : normalizeYouTubeChannelId(rawId) || rawId;

  if (source === "jiosaavn") {
    try {
      const payload = await fetchJioSaavnArtist(id);
      return NextResponse.json(payload, { status: 200 });
    } catch {
      return NextResponse.json(
        { error: "Failed to load artist" },
        { status: 500 }
      );
    }
  }

  if (!isYouTubeChannelId(id)) {
    return NextResponse.json(
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
    const providerEndpoints = await getProviderEndpoints();
    const youtubeWebBase = providerEndpoints.providers.youtube.webBase;
    const invidiousBase = providerEndpoints.instances.invidious[0] || "";
    const [channelResult, videosResult, playlistsResult] = await Promise.all([
      fetchInvidiousChannel(id).catch(() => null),
      fetchInvidiousChannelVideos(id).catch(() => []),
      fetchInvidiousChannelPlaylists(id).catch(() => []),
    ]);

    const invidiousChannel = toRecord(channelResult);

    const nameRaw =
      safeString(invidiousChannel.author) || safeString(invidiousChannel.name);
    const latestVideos = Array.isArray(invidiousChannel.latestVideos)
      ? (invidiousChannel.latestVideos as Array<Record<string, unknown>>)
      : [];
    const videosFallback = Array.isArray(videosResult)
      ? (videosResult as Array<Record<string, unknown>>)
      : [];
    const videosToUse = latestVideos.length > 0 ? latestVideos : videosFallback;

    if (!Object.keys(invidiousChannel).length && videosToUse.length === 0) {
      throw new Error("Failed to load artist");
    }

    const name =
      nameRaw.replace(/\s*-\s*Topic$/i, "") ||
      safeString(videosToUse[0]?.author).replace(/\s*-\s*Topic$/i, "") ||
      "Artist";

    const artist: ArtistPayload["artist"] = {
      id,
      name,
      image: buildInvidiousImageProxyUrl(
        pickBestImageUrl(invidiousChannel.authorThumbnails, invidiousBase)
      ),
      banner: buildInvidiousImageProxyUrl(
        pickBestImageUrl(invidiousChannel.authorBanners, invidiousBase)
      ),
      subscribers: safeNumber(invidiousChannel.subCount),
      verified: Boolean(invidiousChannel.verified),
      description: safeString(invidiousChannel.description),
      source: "youtube",
      url: `${youtubeWebBase}/channel/${encodeURIComponent(id)}`,
    };

    const songs = videosToUse.map((v) => {
      const thumbnails = v.videoThumbnails;
      return {
        id: safeString(v.videoId) || safeString(v.id),
        title: safeString(v.title) || "Unknown",
        thumbnail: buildInvidiousImageProxyUrl(
          pickBestImageUrl(thumbnails, invidiousBase)
        ),
        views: safeNumber(v.viewCount),
        duration: safeNumber(v.lengthSeconds),
      };
    });

    const playlistsList = Array.isArray(playlistsResult)
      ? (playlistsResult as Array<Record<string, unknown>>)
      : [];

    const albums: ArtistPayload["albums"] = [];
    const playlists: ArtistPayload["playlists"] = [];

    for (const p of playlistsList) {
      const playlistId = safeString(p.playlistId) || safeString(p.id);
      const payload = {
        id: playlistId,
        title: safeString(p.title) || "Unknown",
        thumbnail: buildInvidiousImageProxyUrl(
          absolutizeUrl(safeString(p.playlistThumbnail), invidiousBase)
        ),
        videoCount: safeNumber(p.videoCount),
      };

      if (isAutoGeneratedAlbumPlaylistId(playlistId)) albums.push(payload);
      else playlists.push(payload);
    }

    return NextResponse.json(
      {
        artist,
        songs,
        albums,
        playlists,
      } satisfies ArtistPayload,
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to load artist" },
      { status: 500 }
    );
  }
}
