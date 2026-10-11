import type { Song } from "../contexts/AudioContext";
import { fetchBackendRoute } from "./backend-api";

export interface ParsedCollectionUrl {
  source: string;
  kind: "album" | "playlist";
  id: string;
}

export function parseCollectionUrl(input: string): ParsedCollectionUrl | null {
  const raw = input.trim();
  if (!raw) return null;

  let match = raw.match(
    /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)/i
  );
  if (match?.[2]) {
    return {
      source: "spotify",
      kind: match[1] === "album" ? "album" : "playlist",
      id: match[2],
    };
  }

  match = raw.match(/deezer\.com\/(?:[a-z]{2}\/)?(track|album|playlist)\/(\d+)/i);
  if (match?.[2]) {
    return {
      source: "deezer",
      kind: match[1] === "album" ? "album" : "playlist",
      id: match[2],
    };
  }

  match = raw.match(/music\.apple\.com\/[^/]+\/album\/(?:[^/]+\/)?(\d+)/i);
  if (match?.[1]) {
    return { source: "itunes", kind: "album", id: match[1] };
  }

  match = raw.match(/[?&]list=([A-Za-z0-9_-]{10,})/);
  if (match?.[1]) {
    return {
      source: /music\.youtube\.com/i.test(raw) ? "youtubemusic" : "youtube",
      kind: "playlist",
      id: match[1],
    };
  }

  if (/soundcloud\.com\//i.test(raw)) {
    return { source: "soundcloud", kind: "playlist", id: raw };
  }

  match = raw.match(
    /jiosaavn\.com\/(?:featured|playlist|album)\/[^/]+\/([A-Za-z0-9]+)/i
  );
  if (match?.[1]) {
    return {
      source: "jiosaavn",
      kind: /\/album\//i.test(raw) ? "album" : "playlist",
      id: match[1],
    };
  }

  return null;
}

interface CollectionEntryLike {
  id?: string;
  title?: string;
  name?: string;
  artist?: string;
  subtitle?: string;
  duration?: number;
  thumbnailUrl?: string;
  image?: string;
  url?: string;
  primaryArtists?: { name?: string }[];
}

interface CollectionPayloadLike {
  collection?: {
    id?: string;
    title?: string;
    description?: string | null;
    thumbnailUrl?: string;
  };
  entries?: CollectionEntryLike[];
  error?: string;
}

function entryToSong(entry: CollectionEntryLike, source: string): Song | null {
  const id = (entry.id || "").trim();
  if (!id) return null;
  return {
    id,
    title: entry.title || entry.name || "Unknown Title",
    artist:
      entry.artist ||
      entry.subtitle ||
      entry.primaryArtists?.[0]?.name ||
      "Unknown Artist",
    coverUrl: entry.thumbnailUrl || entry.image,
    duration: entry.duration,
    source,
    url: entry.url,
  };
}

export interface ImportedCollection {
  name: string;
  description: string;
  songs: Song[];
  sourceCollectionId: string;
  sourceCollectionKind: string;
  sourceCollectionSource: string;
}

export async function fetchCollectionForImport(
  parsed: ParsedCollectionUrl
): Promise<ImportedCollection> {
  const params = new URLSearchParams({
    id: parsed.id,
    source: parsed.source,
    kind: parsed.kind,
  });
  const response = await fetchBackendRoute("/collection", { searchParams: params });
  const payload = (await response.json()) as CollectionPayloadLike;

  if (!response.ok || payload.error) {
    throw new Error(payload.error || "Failed to import playlist");
  }

  const songs = (payload.entries || [])
    .map((entry) => entryToSong(entry, parsed.source))
    .filter((song): song is Song => Boolean(song));

  if (!songs.length) {
    throw new Error(payload.error || "No tracks found in this playlist");
  }

  return {
    name: payload.collection?.title || "",
    description: payload.collection?.description || "",
    songs,
    sourceCollectionId: payload.collection?.id || parsed.id,
    sourceCollectionKind: parsed.kind,
    sourceCollectionSource: parsed.source,
  };
}
