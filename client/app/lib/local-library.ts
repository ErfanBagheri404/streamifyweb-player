"use client";

import type { Song } from "../contexts/AudioContext";

export const PLAYLISTS_STORAGE_KEY = "libraryUserPlaylists";
export const LIKED_SONGS_STORAGE_KEY = "libraryLikedSongs";
export const LOCAL_LIBRARY_UPDATED_EVENT = "streamify-local-library-updated";

export interface CloudTrackRef {
  id: string;
  source: string;
}

export interface CloudPlaylistSnapshot {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  songs: CloudTrackRef[];
}

export interface CloudLibrarySnapshot {
  playlists: CloudPlaylistSnapshot[];
  likedSongs: CloudTrackRef[];
}

export interface StoredPlaylist {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  songs: Song[];
}

export interface LocalCollectionData {
  collection: {
    id: string;
    title: string;
    author: string;
    description?: string;
    thumbnailUrl?: string;
    source: string;
    count: number;
  };
  songs: Song[];
}

function emitLocalLibraryUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LOCAL_LIBRARY_UPDATED_EVENT));
}

function getSongStorageKey(song: Pick<Song, "id" | "source">): string {
  return `${song.source?.trim().toLowerCase() || "unknown"}:${song.id}`;
}

function normalizeSongSnapshot(song: Song): Song {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    artistId: song.artistId,
    artistImage: song.artistImage,
    artistSource: song.artistSource,
    coverUrl: song.coverUrl,
    audioUrl: song.audioUrl,
    audioUrls: song.audioUrls,
    audioType: song.audioType,
    drmLicenseUrl: song.drmLicenseUrl,
    drmScheme: song.drmScheme,
    drmProvider: song.drmProvider,
    drmHeaders: song.drmHeaders,
    duration: song.duration,
    uploaded: song.uploaded,
    cachedAt: song.cachedAt,
    source: song.source,
    url: song.url,
    playbackStrategy: song.playbackStrategy,
  };
}

function dedupeSongs(songs: Song[]): Song[] {
  const seen = new Set<string>();
  const output: Song[] = [];

  for (const song of songs) {
    if (!song?.id) continue;
    const key = getSongStorageKey(song);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalizeSongSnapshot(song));
  }

  return output;
}

function normalizeCloudTrackRef(value: unknown): CloudTrackRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const source = typeof record.source === "string" ? record.source.trim() : "";
  if (!id || !source) return null;

  return { id, source };
}

function normalizeCloudTrackRefs(value: unknown): CloudTrackRef[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const output: CloudTrackRef[] = [];

  for (const entry of value) {
    const ref = normalizeCloudTrackRef(entry);
    if (!ref) continue;
    const key = `${ref.source}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(ref);
  }

  return output;
}

function normalizeCloudPlaylist(value: unknown): CloudPlaylistSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!id || !name) return null;

  return {
    id,
    name,
    description:
      typeof record.description === "string" ? record.description.trim() : "",
    createdAt:
      typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
        ? record.createdAt
        : Date.now(),
    songs: normalizeCloudTrackRefs(record.songs),
  };
}

function normalizeCloudLibrarySnapshot(value: unknown): CloudLibrarySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { playlists: [], likedSongs: [] };
  }

  const record = value as Record<string, unknown>;
  return {
    playlists: Array.isArray(record.playlists)
      ? record.playlists
          .map((playlist) => normalizeCloudPlaylist(playlist))
          .filter(
            (playlist): playlist is CloudPlaylistSnapshot => Boolean(playlist)
          )
      : [],
    likedSongs: normalizeCloudTrackRefs(record.likedSongs),
  };
}

function createCloudTrackRef(song: Pick<Song, "id" | "source">): CloudTrackRef | null {
  const id = song.id?.trim();
  const source = song.source?.trim();
  if (!id || !source) return null;
  return { id, source };
}

function createPlaceholderSong(ref: CloudTrackRef): Song {
  return {
    id: ref.id,
    source: ref.source,
    title: ref.id,
    artist: ref.source,
  };
}

async function resolveCloudTrackRef(ref: CloudTrackRef): Promise<Song> {
  try {
    const params = new URLSearchParams();
    params.set("id", ref.id);
    params.set("source", ref.source);
    const response = await fetch(`/api/video?${params.toString()}`);
    const payload = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      return createPlaceholderSong(ref);
    }

    return normalizeSongSnapshot({
      id:
        typeof payload.id === "string" && payload.id.trim()
          ? payload.id
          : ref.id,
      source:
        typeof payload.source === "string" && payload.source.trim()
          ? payload.source
          : ref.source,
      title:
        typeof payload.title === "string" && payload.title.trim()
          ? payload.title
          : ref.id,
      artist:
        typeof payload.author === "string" && payload.author.trim()
          ? payload.author
          : ref.source,
      coverUrl:
        typeof payload.thumbnailUrl === "string" && payload.thumbnailUrl.trim()
          ? payload.thumbnailUrl
          : undefined,
      url:
        typeof payload.url === "string" && payload.url.trim()
          ? payload.url
          : undefined,
      duration:
        typeof payload.lengthSeconds === "number" ? payload.lengthSeconds : undefined,
      playbackStrategy:
        payload.playbackStrategy === "widget" ? "widget" : undefined,
    });
  } catch {
    return createPlaceholderSong(ref);
  }
}

function createPlaylistId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePlaylist(raw: unknown): StoredPlaylist | null {
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as Partial<StoredPlaylist>;
  if (!candidate.id || !candidate.name) return null;

  return {
    id: String(candidate.id),
    name: String(candidate.name),
    description:
      typeof candidate.description === "string" ? candidate.description : "",
    createdAt:
      typeof candidate.createdAt === "number"
        ? candidate.createdAt
        : Date.now(),
    songs: dedupeSongs(Array.isArray(candidate.songs) ? candidate.songs : []),
  };
}

export function readStoredPlaylists(): StoredPlaylist[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(PLAYLISTS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((playlist) => normalizePlaylist(playlist))
      .filter((playlist): playlist is StoredPlaylist => Boolean(playlist));
  } catch (error) {
    console.error("Failed to restore playlists:", error);
    return [];
  }
}

export function writeStoredPlaylists(playlists: StoredPlaylist[]) {
  if (typeof window === "undefined") return;

  const normalized = playlists
    .map((playlist) => normalizePlaylist(playlist))
    .filter((playlist): playlist is StoredPlaylist => Boolean(playlist));

  window.localStorage.setItem(
    PLAYLISTS_STORAGE_KEY,
    JSON.stringify(normalized)
  );
  emitLocalLibraryUpdated();
}

export function createCloudLibrarySnapshot(
  playlists: StoredPlaylist[],
  likedSongs: Song[]
): CloudLibrarySnapshot {
  return {
    playlists: playlists.map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      createdAt: playlist.createdAt,
      songs: playlist.songs
        .map((song) => createCloudTrackRef(song))
        .filter((song): song is CloudTrackRef => Boolean(song)),
    })),
    likedSongs: likedSongs
      .map((song) => createCloudTrackRef(song))
      .filter((song): song is CloudTrackRef => Boolean(song)),
  };
}

export function createStoredPlaylist(name: string, description: string) {
  const playlist: StoredPlaylist = {
    id: createPlaylistId(),
    name: name.trim(),
    description: description.trim(),
    createdAt: Date.now(),
    songs: [],
  };

  const next = [playlist, ...readStoredPlaylists()];
  writeStoredPlaylists(next);
  return playlist;
}

export function removeStoredPlaylist(playlistId: string) {
  const playlists = readStoredPlaylists();
  const removedPlaylist =
    playlists.find((playlist) => playlist.id === playlistId) || null;

  if (!removedPlaylist) {
    return {
      removed: false,
      playlist: null,
    };
  }

  writeStoredPlaylists(
    playlists.filter((playlist) => playlist.id !== playlistId)
  );

  return {
    removed: true,
    playlist: removedPlaylist,
  };
}

export function addSongToPlaylist(playlistId: string, song: Song) {
  const playlists = readStoredPlaylists();
  let updatedPlaylist: StoredPlaylist | null = null;
  let alreadyExists = false;

  const next = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;

    alreadyExists = playlist.songs.some(
      (entry) => getSongStorageKey(entry) === getSongStorageKey(song)
    );
    updatedPlaylist = {
      ...playlist,
      songs: alreadyExists
        ? playlist.songs
        : [normalizeSongSnapshot(song), ...playlist.songs],
    };
    return updatedPlaylist;
  });

  if (updatedPlaylist) {
    writeStoredPlaylists(next);
  }

  return {
    playlist: updatedPlaylist,
    alreadyExists,
  };
}

export function readLikedSongs(): Song[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(LIKED_SONGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Song[];
    return dedupeSongs(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    console.error("Failed to restore liked songs:", error);
    return [];
  }
}

export function writeLikedSongs(songs: Song[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    LIKED_SONGS_STORAGE_KEY,
    JSON.stringify(dedupeSongs(songs))
  );
  emitLocalLibraryUpdated();
}

export function isSongLiked(songId?: string, source?: string): boolean {
  if (!songId) return false;
  return readLikedSongs().some(
    (song) =>
      song.id === songId &&
      (source ? (song.source || "") === source : true)
  );
}

export function toggleLikedSong(song: Song) {
  const likedSongs = readLikedSongs();
  const exists = likedSongs.some(
    (entry) => getSongStorageKey(entry) === getSongStorageKey(song)
  );

  const next = exists
    ? likedSongs.filter(
        (entry) => getSongStorageKey(entry) !== getSongStorageKey(song)
      )
    : [normalizeSongSnapshot(song), ...likedSongs];

  writeLikedSongs(next);

  return {
    liked: !exists,
    songs: next,
  };
}

export async function restoreCloudLibrary(snapshot: unknown) {
  const normalized = normalizeCloudLibrarySnapshot(snapshot);
  const restoredPlaylists = await Promise.all(
    normalized.playlists.map(async (playlist) => ({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      createdAt: playlist.createdAt,
      songs: await Promise.all(playlist.songs.map(resolveCloudTrackRef)),
    }))
  );
  const restoredLikedSongs = await Promise.all(
    normalized.likedSongs.map(resolveCloudTrackRef)
  );

  writeStoredPlaylists(restoredPlaylists);
  writeLikedSongs(restoredLikedSongs);
}

function readRecentSongsFromAudioState(): Song[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem("audioPlayerState");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { recentSongs?: Song[] };
    return dedupeSongs(
      Array.isArray(parsed.recentSongs) ? parsed.recentSongs : []
    );
  } catch (error) {
    console.error("Failed to restore recent songs:", error);
    return [];
  }
}

export function getLocalCollectionPath(id: string): string {
  return `/collection/playlist/${encodeURIComponent(id)}?source=local`;
}

export function readLocalCollection(id: string): LocalCollectionData | null {
  if (id === "liked-songs") {
    const songs = readLikedSongs();
    return {
      collection: {
        id,
        title: "Liked Songs",
        author: "You",
        description: "Tracks you have liked and saved.",
        thumbnailUrl: songs[0]?.coverUrl,
        source: "local",
        count: songs.length,
      },
      songs,
    };
  }

  if (id === "previously-played") {
    const songs = readRecentSongsFromAudioState();
    return {
      collection: {
        id,
        title: "Previously Played",
        author: "You",
        description: "Your recently played tracks.",
        thumbnailUrl: songs[0]?.coverUrl,
        source: "local",
        count: songs.length,
      },
      songs,
    };
  }

  const playlist = readStoredPlaylists().find((entry) => entry.id === id);
  if (!playlist) return null;

  return {
    collection: {
      id: playlist.id,
      title: playlist.name,
      author: "You",
      description: playlist.description,
      thumbnailUrl: playlist.songs[0]?.coverUrl,
      source: "local",
      count: playlist.songs.length,
    },
    songs: playlist.songs,
  };
}
