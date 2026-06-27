"use client";

import type { Song } from "../contexts/AudioContext";
import { normalizeYouTubeThumbnailUrl } from "./youtube-thumbnails";

export const PLAYLISTS_STORAGE_KEY = "libraryUserPlaylists";
export const LIKED_SONGS_STORAGE_KEY = "libraryLikedSongs";
export const LOCAL_LIBRARY_UPDATED_EVENT = "streamify-local-library-updated";
const SONG_METADATA_CACHE_STORAGE_KEY = "librarySongMetadataCache";

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
  sourceCollectionId?: string;
  sourceCollectionKind?: string;
  sourceCollectionSource?: string;
  sourceCollectionUrl?: string;
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
  const normalizedCoverUrl =
    song.source === "youtube" || song.source === "youtubemusic"
      ? normalizeYouTubeThumbnailUrl({
          url: song.coverUrl,
          videoId: song.id,
        }) || song.coverUrl
      : song.coverUrl;

  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    artistId: song.artistId,
    artistImage: song.artistImage,
    artistSource: song.artistSource,
    coverUrl: normalizedCoverUrl,
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

function readSongMetadataCache(): Record<string, Song> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(SONG_METADATA_CACHE_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, Song>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const normalizedEntries = Object.entries(parsed)
      .map(([key, value]) => {
        if (!value?.id) return null;
        return [key, normalizeSongSnapshot(value)] as const;
      })
      .filter((entry): entry is readonly [string, Song] => Boolean(entry));

    return Object.fromEntries(normalizedEntries);
  } catch {
    return {};
  }
}

function writeSongMetadataCache(cache: Record<string, Song>) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      SONG_METADATA_CACHE_STORAGE_KEY,
      JSON.stringify(cache)
    );
  } catch {}
}

function updateSongMetadataCache(songs: Song[]) {
  if (typeof window === "undefined" || songs.length === 0) return;

  const nextCache = readSongMetadataCache();
  for (const song of songs) {
    if (!song?.id) continue;
    nextCache[getSongStorageKey(song)] = normalizeSongSnapshot(song);
  }

  writeSongMetadataCache(nextCache);
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

function chooseNonEmptyString(
  ...values: Array<string | null | undefined>
): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return undefined;
}

function chooseFiniteNumber(
  ...values: Array<number | null | undefined>
): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function matchesPlaceholderValue(
  value: string | null | undefined,
  fallback: string | null | undefined
): boolean {
  if (typeof value !== "string" || typeof fallback !== "string") return false;
  return value.trim().toLowerCase() === fallback.trim().toLowerCase();
}

function chooseSongTitle(
  primary: Song,
  secondary?: Song | null
): string | undefined {
  const primaryTitle = primary.title?.trim();
  const secondaryTitle = secondary?.title?.trim();

  if (
    primaryTitle &&
    !matchesPlaceholderValue(primaryTitle, primary.id) &&
    primaryTitle.toLowerCase() !== "unknown track"
  ) {
    return primaryTitle;
  }

  if (
    secondaryTitle &&
    !matchesPlaceholderValue(secondaryTitle, secondary?.id) &&
    secondaryTitle.toLowerCase() !== "unknown track"
  ) {
    return secondaryTitle;
  }

  return chooseNonEmptyString(
    primaryTitle,
    secondaryTitle,
    primary.id,
    secondary?.id
  );
}

function chooseSongArtist(
  primary: Song,
  secondary?: Song | null
): string | undefined {
  const primaryArtist = primary.artist?.trim();
  const secondaryArtist = secondary?.artist?.trim();

  if (
    primaryArtist &&
    !matchesPlaceholderValue(primaryArtist, primary.source) &&
    primaryArtist.toLowerCase() !== "unknown artist"
  ) {
    return primaryArtist;
  }

  if (
    secondaryArtist &&
    !matchesPlaceholderValue(secondaryArtist, secondary?.source) &&
    secondaryArtist.toLowerCase() !== "unknown artist"
  ) {
    return secondaryArtist;
  }

  return chooseNonEmptyString(
    primaryArtist,
    secondaryArtist,
    primary.source,
    secondary?.source
  );
}

function chooseAudioType(
  ...values: Array<Song["audioType"] | null | undefined>
): Song["audioType"] {
  for (const value of values) {
    if (value === "file" || value === "hls" || value === "soundcloud-drm") {
      return value;
    }
  }

  return undefined;
}

function mergeSongSnapshots(primary: Song, secondary?: Song | null): Song {
  const merged: Song = {
    id:
      chooseNonEmptyString(primary.id, secondary?.id) ||
      primary.id ||
      secondary?.id ||
      "",
    title: chooseSongTitle(primary, secondary) || "Unknown Track",
    artist: chooseSongArtist(primary, secondary) || "Unknown Artist",
    artistId: chooseNonEmptyString(primary.artistId, secondary?.artistId),
    artistImage: chooseNonEmptyString(
      primary.artistImage,
      secondary?.artistImage
    ),
    artistSource: chooseNonEmptyString(
      primary.artistSource,
      secondary?.artistSource
    ),
    coverUrl: chooseNonEmptyString(primary.coverUrl, secondary?.coverUrl),
    audioUrl: chooseNonEmptyString(primary.audioUrl, secondary?.audioUrl),
    audioUrls:
      Array.isArray(primary.audioUrls) && primary.audioUrls.length > 0
        ? primary.audioUrls
        : Array.isArray(secondary?.audioUrls) && secondary.audioUrls.length > 0
        ? secondary.audioUrls
        : undefined,
    audioType: chooseAudioType(primary.audioType, secondary?.audioType),
    drmLicenseUrl: chooseNonEmptyString(
      primary.drmLicenseUrl,
      secondary?.drmLicenseUrl
    ),
    drmScheme: chooseNonEmptyString(primary.drmScheme, secondary?.drmScheme),
    drmProvider: chooseNonEmptyString(
      primary.drmProvider,
      secondary?.drmProvider
    ),
    drmHeaders:
      primary.drmHeaders && Object.keys(primary.drmHeaders).length > 0
        ? primary.drmHeaders
        : secondary?.drmHeaders && Object.keys(secondary.drmHeaders).length > 0
        ? secondary.drmHeaders
        : undefined,
    duration: chooseFiniteNumber(primary.duration, secondary?.duration),
    uploaded: chooseNonEmptyString(primary.uploaded, secondary?.uploaded),
    cachedAt: chooseFiniteNumber(primary.cachedAt, secondary?.cachedAt),
    source: chooseNonEmptyString(primary.source, secondary?.source),
    url: chooseNonEmptyString(primary.url, secondary?.url),
    playbackStrategy:
      primary.playbackStrategy || secondary?.playbackStrategy || undefined,
    relatedSongs:
      Array.isArray(primary.relatedSongs) && primary.relatedSongs.length > 0
        ? primary.relatedSongs
        : Array.isArray(secondary?.relatedSongs) &&
          secondary.relatedSongs.length > 0
        ? secondary.relatedSongs
        : undefined,
  };

  return normalizeSongSnapshot(merged);
}

function mergeSongs(primarySongs: Song[], secondarySongs: Song[]): Song[] {
  const secondaryByKey = new Map<string, Song>();
  for (const song of secondarySongs) {
    if (!song?.id) continue;
    secondaryByKey.set(getSongStorageKey(song), normalizeSongSnapshot(song));
  }

  const merged: Song[] = [];
  const seen = new Set<string>();

  for (const song of primarySongs) {
    if (!song?.id) continue;
    const key = getSongStorageKey(song);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(mergeSongSnapshots(song, secondaryByKey.get(key)));
    secondaryByKey.delete(key);
  }

  for (const song of secondaryByKey.values()) {
    const key = getSongStorageKey(song);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalizeSongSnapshot(song));
  }

  return merged;
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

function getCloudTrackRefKey(ref: CloudTrackRef): string {
  return `${ref.source.trim().toLowerCase()}:${ref.id}`;
}

function mergeCloudTrackRefs(
  primaryRefs: CloudTrackRef[],
  secondaryRefs: CloudTrackRef[]
): CloudTrackRef[] {
  const seen = new Set<string>();
  const merged: CloudTrackRef[] = [];

  for (const ref of [...primaryRefs, ...secondaryRefs]) {
    const normalized = normalizeCloudTrackRef(ref);
    if (!normalized) continue;
    const key = getCloudTrackRefKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
  }

  return merged;
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
          .filter((playlist): playlist is CloudPlaylistSnapshot =>
            Boolean(playlist)
          )
      : [],
    likedSongs: normalizeCloudTrackRefs(record.likedSongs),
  };
}

function mergeStoredPlaylist(
  primary: StoredPlaylist,
  secondary?: StoredPlaylist | null
): StoredPlaylist {
  return {
    id: primary.id,
    name: chooseNonEmptyString(primary.name, secondary?.name) || primary.id,
    description:
      chooseNonEmptyString(primary.description, secondary?.description) || "",
    createdAt:
      chooseFiniteNumber(primary.createdAt, secondary?.createdAt, Date.now()) ||
      Date.now(),
    songs: mergeSongs(primary.songs, secondary?.songs || []),
    sourceCollectionId: chooseNonEmptyString(
      primary.sourceCollectionId,
      secondary?.sourceCollectionId
    ),
    sourceCollectionKind: chooseNonEmptyString(
      primary.sourceCollectionKind,
      secondary?.sourceCollectionKind
    ),
    sourceCollectionSource: chooseNonEmptyString(
      primary.sourceCollectionSource,
      secondary?.sourceCollectionSource
    )?.toLowerCase(),
    sourceCollectionUrl: chooseNonEmptyString(
      primary.sourceCollectionUrl,
      secondary?.sourceCollectionUrl
    ),
  };
}

function mergeStoredPlaylists(
  primaryPlaylists: StoredPlaylist[],
  secondaryPlaylists: StoredPlaylist[]
): StoredPlaylist[] {
  const secondaryById = new Map<string, StoredPlaylist>();
  for (const playlist of secondaryPlaylists) {
    secondaryById.set(playlist.id, playlist);
  }

  const merged: StoredPlaylist[] = [];
  const seen = new Set<string>();

  for (const playlist of primaryPlaylists) {
    if (!playlist?.id || seen.has(playlist.id)) continue;
    seen.add(playlist.id);
    merged.push(mergeStoredPlaylist(playlist, secondaryById.get(playlist.id)));
    secondaryById.delete(playlist.id);
  }

  for (const playlist of secondaryById.values()) {
    if (!playlist?.id || seen.has(playlist.id)) continue;
    seen.add(playlist.id);
    merged.push(normalizePlaylist(playlist) || playlist);
  }

  return merged;
}

function mergeCloudPlaylist(
  primary: CloudPlaylistSnapshot,
  secondary?: CloudPlaylistSnapshot | null
): CloudPlaylistSnapshot {
  return {
    id: primary.id,
    name: chooseNonEmptyString(primary.name, secondary?.name) || primary.id,
    description:
      chooseNonEmptyString(primary.description, secondary?.description) || "",
    createdAt:
      chooseFiniteNumber(primary.createdAt, secondary?.createdAt, Date.now()) ||
      Date.now(),
    songs: mergeCloudTrackRefs(primary.songs, secondary?.songs || []),
  };
}

export function mergeCloudLibrarySnapshots(
  primarySnapshot: CloudLibrarySnapshot,
  secondarySnapshot: CloudLibrarySnapshot
): CloudLibrarySnapshot {
  const primary = normalizeCloudLibrarySnapshot(primarySnapshot);
  const secondary = normalizeCloudLibrarySnapshot(secondarySnapshot);
  const secondaryPlaylistsById = new Map<string, CloudPlaylistSnapshot>();

  for (const playlist of secondary.playlists) {
    secondaryPlaylistsById.set(playlist.id, playlist);
  }

  const playlists: CloudPlaylistSnapshot[] = [];
  const seenPlaylistIds = new Set<string>();

  for (const playlist of primary.playlists) {
    if (!playlist?.id || seenPlaylistIds.has(playlist.id)) continue;
    seenPlaylistIds.add(playlist.id);
    playlists.push(
      mergeCloudPlaylist(playlist, secondaryPlaylistsById.get(playlist.id))
    );
    secondaryPlaylistsById.delete(playlist.id);
  }

  for (const playlist of secondaryPlaylistsById.values()) {
    if (!playlist?.id || seenPlaylistIds.has(playlist.id)) continue;
    seenPlaylistIds.add(playlist.id);
    playlists.push(playlist);
  }

  return {
    playlists,
    likedSongs: mergeCloudTrackRefs(primary.likedSongs, secondary.likedSongs),
  };
}

function createCloudTrackRef(
  song: Pick<Song, "id" | "source">
): CloudTrackRef | null {
  const id = song.id?.trim();
  const source = song.source?.trim();
  if (!id || !source) return null;
  return { id, source };
}

function hasPlaceholderSongMetadata(song: Song): boolean {
  const title = song.title?.trim();
  const artist = song.artist?.trim();
  const source = song.source?.trim();

  return Boolean(
    !title ||
      matchesPlaceholderValue(title, song.id) ||
      title.toLowerCase() === "unknown track" ||
      !artist ||
      matchesPlaceholderValue(artist, source) ||
      artist.toLowerCase() === "unknown artist"
  );
}

function createPlaceholderSong(ref: CloudTrackRef): Song {
  return {
    id: ref.id,
    source: ref.source,
    title: ref.id,
    artist: ref.source,
  };
}

function buildKnownSongMetadataMap(): Map<string, Song> {
  const metadataMap = new Map<string, Song>();

  for (const song of Object.values(readSongMetadataCache())) {
    if (!song?.id) continue;
    metadataMap.set(getSongStorageKey(song), normalizeSongSnapshot(song));
  }

  for (const song of readLikedSongs()) {
    if (!song?.id) continue;
    metadataMap.set(getSongStorageKey(song), normalizeSongSnapshot(song));
  }

  for (const playlist of readStoredPlaylists()) {
    for (const song of playlist.songs) {
      if (!song?.id) continue;
      metadataMap.set(getSongStorageKey(song), normalizeSongSnapshot(song));
    }
  }

  for (const song of readRecentSongsFromAudioState()) {
    if (!song?.id) continue;
    metadataMap.set(getSongStorageKey(song), normalizeSongSnapshot(song));
  }

  return metadataMap;
}

async function resolveCloudTrackRef(
  ref: CloudTrackRef,
  knownSong?: Song | null
): Promise<Song> {
  try {
    const params = new URLSearchParams();
    params.set("id", ref.id);
    params.set("source", ref.source);
    if (knownSong?.title) {
      params.set("title", knownSong.title);
    }
    if (knownSong?.artist) {
      params.set("artist", knownSong.artist);
    }
    if (knownSong?.url) {
      params.set("url", knownSong.url);
    }
    const response = await fetch(`/api/video?${params.toString()}`);
    const payload = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      return knownSong
        ? mergeSongSnapshots(knownSong, createPlaceholderSong(ref))
        : createPlaceholderSong(ref);
    }

    return mergeSongSnapshots(
      normalizeSongSnapshot({
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
          typeof payload.thumbnailUrl === "string" &&
          payload.thumbnailUrl.trim()
            ? payload.thumbnailUrl
            : undefined,
        url:
          typeof payload.url === "string" && payload.url.trim()
            ? payload.url
            : undefined,
        duration:
          typeof payload.lengthSeconds === "number"
            ? payload.lengthSeconds
            : undefined,
        playbackStrategy:
          payload.playbackStrategy === "widget" ? "widget" : undefined,
      }),
      knownSong
    );
  } catch {
    return knownSong
      ? mergeSongSnapshots(knownSong, createPlaceholderSong(ref))
      : createPlaceholderSong(ref);
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
    sourceCollectionId:
      typeof candidate.sourceCollectionId === "string" &&
      candidate.sourceCollectionId.trim()
        ? candidate.sourceCollectionId.trim()
        : undefined,
    sourceCollectionKind:
      typeof candidate.sourceCollectionKind === "string" &&
      candidate.sourceCollectionKind.trim()
        ? candidate.sourceCollectionKind.trim()
        : undefined,
    sourceCollectionSource:
      typeof candidate.sourceCollectionSource === "string" &&
      candidate.sourceCollectionSource.trim()
        ? candidate.sourceCollectionSource.trim().toLowerCase()
        : undefined,
    sourceCollectionUrl:
      typeof candidate.sourceCollectionUrl === "string" &&
      candidate.sourceCollectionUrl.trim()
        ? candidate.sourceCollectionUrl.trim()
        : undefined,
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
  updateSongMetadataCache(normalized.flatMap((playlist) => playlist.songs));
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

export function createStoredPlaylist(
  name: string,
  description: string,
  options?: {
    songs?: Song[];
    sourceCollectionId?: string;
    sourceCollectionKind?: string;
    sourceCollectionSource?: string;
    sourceCollectionUrl?: string;
  }
) {
  const playlist: StoredPlaylist = {
    id: createPlaylistId(),
    name: name.trim(),
    description: description.trim(),
    createdAt: Date.now(),
    songs: dedupeSongs(options?.songs || []),
    sourceCollectionId: options?.sourceCollectionId?.trim() || undefined,
    sourceCollectionKind: options?.sourceCollectionKind?.trim() || undefined,
    sourceCollectionSource:
      options?.sourceCollectionSource?.trim().toLowerCase() || undefined,
    sourceCollectionUrl: options?.sourceCollectionUrl?.trim() || undefined,
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

export function renameStoredPlaylist(
  playlistId: string,
  name: string,
  description: string
) {
  const nextName = name.trim();
  if (!nextName) {
    return {
      updated: false,
      playlist: null,
    };
  }

  const playlists = readStoredPlaylists();
  let updatedPlaylist: StoredPlaylist | null = null;

  const next = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;

    updatedPlaylist = {
      ...playlist,
      name: nextName,
      description: description.trim(),
    };
    return updatedPlaylist;
  });

  if (updatedPlaylist) {
    writeStoredPlaylists(next);
  }

  return {
    updated: Boolean(updatedPlaylist),
    playlist: updatedPlaylist,
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
        : [...playlist.songs, normalizeSongSnapshot(song)],
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

export function moveSongInStoredPlaylist(
  playlistId: string,
  fromIndex: number,
  toIndex: number
) {
  const playlists = readStoredPlaylists();
  let updatedPlaylist: StoredPlaylist | null = null;

  const next = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= playlist.songs.length ||
      toIndex >= playlist.songs.length ||
      fromIndex === toIndex
    ) {
      updatedPlaylist = playlist;
      return playlist;
    }

    const songs = [...playlist.songs];
    const [movedSong] = songs.splice(fromIndex, 1);
    if (!movedSong) {
      updatedPlaylist = playlist;
      return playlist;
    }

    songs.splice(toIndex, 0, movedSong);
    updatedPlaylist = {
      ...playlist,
      songs,
    };
    return updatedPlaylist;
  });

  if (updatedPlaylist) {
    writeStoredPlaylists(next);
  }

  return updatedPlaylist;
}

export function removeSongFromStoredPlaylist(
  playlistId: string,
  songId: string,
  source?: string
) {
  if (!songId) {
    return {
      removed: false,
      playlist: null,
    };
  }

  const targetSource = source?.trim();
  const playlists = readStoredPlaylists();
  let updatedPlaylist: StoredPlaylist | null = null;
  let removed = false;

  const next = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;

    const songs = playlist.songs.filter((song) => {
      const sameId = song.id === songId;
      const sameSource = targetSource
        ? (song.source || "") === targetSource
        : true;
      const shouldRemove = sameId && sameSource && !removed;
      if (shouldRemove) {
        removed = true;
      }
      return !shouldRemove;
    });

    updatedPlaylist = removed
      ? {
          ...playlist,
          songs,
        }
      : playlist;
    return updatedPlaylist;
  });

  if (removed && updatedPlaylist) {
    writeStoredPlaylists(next);
  }

  return {
    removed,
    playlist: updatedPlaylist,
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
  const normalizedSongs = dedupeSongs(songs);
  window.localStorage.setItem(
    LIKED_SONGS_STORAGE_KEY,
    JSON.stringify(normalizedSongs)
  );
  updateSongMetadataCache(normalizedSongs);
  emitLocalLibraryUpdated();
}

export async function refreshLocalLibrarySongMetadata() {
  const playlists = readStoredPlaylists();
  const likedSongs = readLikedSongs();
  const songsToRefresh = [
    ...playlists.flatMap((playlist) => playlist.songs),
    ...likedSongs,
  ].filter(
    (song) => song?.id && song.source && hasPlaceholderSongMetadata(song)
  );

  if (songsToRefresh.length === 0) {
    return { refreshed: 0 };
  }

  const resolvedEntries = await Promise.all(
    songsToRefresh.map(async (song) => {
      const ref = createCloudTrackRef(song);
      if (!ref) return null;

      return [
        getSongStorageKey(song),
        await resolveCloudTrackRef(ref, song),
      ] as const;
    })
  );

  const resolvedByKey = new Map<string, Song>(
    resolvedEntries.filter((entry): entry is readonly [string, Song] =>
      Boolean(entry)
    )
  );

  if (resolvedByKey.size === 0) {
    return { refreshed: 0 };
  }

  const nextPlaylists = playlists.map((playlist) => ({
    ...playlist,
    songs: playlist.songs.map((song) => {
      const resolved = resolvedByKey.get(getSongStorageKey(song));
      return resolved ? mergeSongSnapshots(song, resolved) : song;
    }),
  }));
  const nextLikedSongs = likedSongs.map((song) => {
    const resolved = resolvedByKey.get(getSongStorageKey(song));
    return resolved ? mergeSongSnapshots(song, resolved) : song;
  });

  writeStoredPlaylists(nextPlaylists);
  writeLikedSongs(nextLikedSongs);

  return { refreshed: resolvedByKey.size };
}

export function isSongLiked(songId?: string, source?: string): boolean {
  if (!songId) return false;
  return readLikedSongs().some(
    (song) =>
      song.id === songId && (source ? (song.source || "") === source : true)
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
    : [...likedSongs, normalizeSongSnapshot(song)];

  writeLikedSongs(next);

  return {
    liked: !exists,
    songs: next,
  };
}

export function findStoredPlaylistForSourceCollection(
  collectionId: string,
  collectionKind: string,
  collectionSource: string
): StoredPlaylist | null {
  const normalizedSource = collectionSource.trim().toLowerCase();
  return (
    readStoredPlaylists().find(
      (playlist) =>
        playlist.sourceCollectionId === collectionId &&
        playlist.sourceCollectionKind === collectionKind &&
        (playlist.sourceCollectionSource || "") === normalizedSource
    ) || null
  );
}

export async function restoreCloudLibrary(snapshot: unknown) {
  const normalized = normalizeCloudLibrarySnapshot(snapshot);
  const knownSongsByKey = buildKnownSongMetadataMap();
  const restoredPlaylists = await Promise.all(
    normalized.playlists.map(async (playlist) => ({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      createdAt: playlist.createdAt,
      songs: await Promise.all(
        playlist.songs.map((ref) =>
          resolveCloudTrackRef(
            ref,
            knownSongsByKey.get(getCloudTrackRefKey(ref))
          )
        )
      ),
    }))
  );
  const restoredLikedSongs = await Promise.all(
    normalized.likedSongs.map((ref) =>
      resolveCloudTrackRef(ref, knownSongsByKey.get(getCloudTrackRefKey(ref)))
    )
  );
  writeStoredPlaylists(
    mergeStoredPlaylists(readStoredPlaylists(), restoredPlaylists)
  );
  writeLikedSongs(mergeSongs(readLikedSongs(), restoredLikedSongs));
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
