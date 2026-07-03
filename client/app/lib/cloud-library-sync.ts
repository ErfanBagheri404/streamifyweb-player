import {
  createCloudLibrarySnapshot,
  mergeCloudLibrarySnapshots,
  readLikedSongs,
  readStoredPlaylists,
  restoreCloudLibrary,
  type CloudLibrarySnapshot,
} from "./local-library";

const LAST_SYNCED_CLOUD_LIBRARY_SNAPSHOT_STORAGE_KEY =
  "streamify-last-synced-cloud-library-snapshot";

export type LocalLibrarySyncSource = {
  playlists: ReturnType<typeof readStoredPlaylists>;
  likedSongs: ReturnType<typeof readLikedSongs>;
  snapshot: CloudLibrarySnapshot;
};

export function buildCurrentLocalLibrarySyncSource(): LocalLibrarySyncSource {
  const playlists = readStoredPlaylists();
  const likedSongs = readLikedSongs();

  return {
    playlists,
    likedSongs,
    snapshot: createCloudLibrarySnapshot(playlists, likedSongs),
  };
}

function hasSnapshotData(snapshot: CloudLibrarySnapshot): boolean {
  return snapshot.playlists.length > 0 || snapshot.likedSongs.length > 0;
}

type CloudTrackRef = CloudLibrarySnapshot["likedSongs"][number];
type CloudPlaylistSnapshot = CloudLibrarySnapshot["playlists"][number];

function normalizeTrackRef(value: unknown): CloudTrackRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const source =
    typeof record.source === "string" ? record.source.trim().toLowerCase() : "";

  if (!id || !source) return null;
  return { id, source };
}

function getTrackRefKey(ref: CloudTrackRef): string {
  return `${ref.source}:${ref.id}`;
}

function normalizeTrackRefs(value: unknown): CloudTrackRef[] {
  if (!Array.isArray(value)) return [];

  const output: CloudTrackRef[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    const ref = normalizeTrackRef(entry);
    if (!ref) continue;
    const key = getTrackRefKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(ref);
  }

  return output;
}

function normalizePlaylist(value: unknown): CloudPlaylistSnapshot | null {
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
    songs: normalizeTrackRefs(record.songs),
  };
}

function normalizeSnapshot(snapshot: unknown): CloudLibrarySnapshot {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { playlists: [], likedSongs: [] };
  }

  const record = snapshot as Record<string, unknown>;
  return {
    playlists: Array.isArray(record.playlists)
      ? record.playlists
          .map((playlist) => normalizePlaylist(playlist))
          .filter((playlist): playlist is CloudPlaylistSnapshot =>
            Boolean(playlist)
          )
      : [],
    likedSongs: normalizeTrackRefs(record.likedSongs),
  };
}

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function readLastSyncedCloudLibrarySnapshot(): CloudLibrarySnapshot | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(
      LAST_SYNCED_CLOUD_LIBRARY_SNAPSHOT_STORAGE_KEY
    );
    if (!raw) return null;
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveLastSyncedCloudLibrarySnapshot(
  snapshot: CloudLibrarySnapshot
) {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(
      LAST_SYNCED_CLOUD_LIBRARY_SNAPSHOT_STORAGE_KEY,
      JSON.stringify(normalizeSnapshot(snapshot))
    );
  } catch {}
}

export function clearLastSyncedCloudLibrarySnapshot() {
  if (!canUseStorage()) return;

  try {
    window.localStorage.removeItem(
      LAST_SYNCED_CLOUD_LIBRARY_SNAPSHOT_STORAGE_KEY
    );
  } catch {}
}

function choosePresence(
  base: boolean,
  local: boolean,
  remote: boolean
): boolean {
  if (local === remote) return local;
  if (local !== base && remote === base) return local;
  if (remote !== base && local === base) return remote;
  return local;
}

function chooseScalarValue<T>(base: T, local: T, remote: T): T {
  if (Object.is(local, remote)) return local;
  if (!Object.is(local, base) && Object.is(remote, base)) return local;
  if (!Object.is(remote, base) && Object.is(local, base)) return remote;
  return local;
}

function buildOrderedTrackKeys(
  baseRefs: CloudTrackRef[],
  localRefs: CloudTrackRef[],
  remoteRefs: CloudTrackRef[]
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();

  for (const ref of [...localRefs, ...remoteRefs, ...baseRefs]) {
    const key = getTrackRefKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }

  return keys;
}

function mergeTrackRefsWithBase(
  baseRefs: CloudTrackRef[],
  localRefs: CloudTrackRef[],
  remoteRefs: CloudTrackRef[]
): CloudTrackRef[] {
  const baseByKey = new Map(baseRefs.map((ref) => [getTrackRefKey(ref), ref]));
  const localByKey = new Map(
    localRefs.map((ref) => [getTrackRefKey(ref), ref])
  );
  const remoteByKey = new Map(
    remoteRefs.map((ref) => [getTrackRefKey(ref), ref])
  );

  const merged: CloudTrackRef[] = [];
  for (const key of buildOrderedTrackKeys(baseRefs, localRefs, remoteRefs)) {
    const shouldKeep = choosePresence(
      baseByKey.has(key),
      localByKey.has(key),
      remoteByKey.has(key)
    );

    if (!shouldKeep) continue;
    const ref =
      localByKey.get(key) || remoteByKey.get(key) || baseByKey.get(key);
    if (ref) {
      merged.push(ref);
    }
  }

  return merged;
}

function mergePlaylistWithBase(
  basePlaylist: CloudPlaylistSnapshot | undefined,
  localPlaylist: CloudPlaylistSnapshot | undefined,
  remotePlaylist: CloudPlaylistSnapshot | undefined
): CloudPlaylistSnapshot | null {
  const shouldKeep = choosePresence(
    Boolean(basePlaylist),
    Boolean(localPlaylist),
    Boolean(remotePlaylist)
  );

  if (!shouldKeep) {
    return null;
  }

  if (!localPlaylist && !remotePlaylist) {
    return basePlaylist || null;
  }

  if (!localPlaylist) {
    return remotePlaylist || basePlaylist || null;
  }

  if (!remotePlaylist) {
    return localPlaylist || basePlaylist || null;
  }

  return {
    id: localPlaylist.id,
    name: chooseScalarValue(
      basePlaylist?.name || "",
      localPlaylist.name,
      remotePlaylist.name
    ),
    description: chooseScalarValue(
      basePlaylist?.description || "",
      localPlaylist.description,
      remotePlaylist.description
    ),
    createdAt: chooseScalarValue(
      basePlaylist?.createdAt || localPlaylist.createdAt,
      localPlaylist.createdAt,
      remotePlaylist.createdAt
    ),
    songs: mergeTrackRefsWithBase(
      basePlaylist?.songs || [],
      localPlaylist.songs,
      remotePlaylist.songs
    ),
  };
}

function mergeCloudLibrarySnapshotsWithBase(
  baseSnapshot: CloudLibrarySnapshot,
  localSnapshot: CloudLibrarySnapshot,
  remoteSnapshot: CloudLibrarySnapshot
): CloudLibrarySnapshot {
  const base = normalizeSnapshot(baseSnapshot);
  const local = normalizeSnapshot(localSnapshot);
  const remote = normalizeSnapshot(remoteSnapshot);

  const basePlaylistsById = new Map(
    base.playlists.map((playlist) => [playlist.id, playlist])
  );
  const localPlaylistsById = new Map(
    local.playlists.map((playlist) => [playlist.id, playlist])
  );
  const remotePlaylistsById = new Map(
    remote.playlists.map((playlist) => [playlist.id, playlist])
  );

  const playlistIds: string[] = [];
  const seenPlaylistIds = new Set<string>();
  for (const playlist of [
    ...local.playlists,
    ...remote.playlists,
    ...base.playlists,
  ]) {
    if (seenPlaylistIds.has(playlist.id)) continue;
    seenPlaylistIds.add(playlist.id);
    playlistIds.push(playlist.id);
  }

  const playlists = playlistIds
    .map((playlistId) =>
      mergePlaylistWithBase(
        basePlaylistsById.get(playlistId),
        localPlaylistsById.get(playlistId),
        remotePlaylistsById.get(playlistId)
      )
    )
    .filter((playlist): playlist is CloudPlaylistSnapshot => Boolean(playlist));

  return {
    playlists,
    likedSongs: mergeTrackRefsWithBase(
      base.likedSongs,
      local.likedSongs,
      remote.likedSongs
    ),
  };
}

export async function pullCloudLibrarySnapshot(): Promise<CloudLibrarySnapshot> {
  const response = await fetch("/api/library/sync", {
    method: "GET",
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    error?: string;
    playlists?: CloudLibrarySnapshot["playlists"];
    likedSongs?: CloudLibrarySnapshot["likedSongs"];
  };

  if (!response.ok) {
    throw new Error(payload.error || "Library sync failed");
  }

  return {
    playlists: Array.isArray(payload.playlists) ? payload.playlists : [],
    likedSongs: Array.isArray(payload.likedSongs) ? payload.likedSongs : [],
  };
}

export async function pushCloudLibrarySnapshot(snapshot: CloudLibrarySnapshot) {
  const response = await fetch("/api/library/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(snapshot),
  });

  const payload = (await response.json()) as {
    error?: string;
    syncedPlaylists?: number;
    syncedLikes?: number;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Library sync failed");
  }

  return {
    syncedPlaylists: payload.syncedPlaylists ?? snapshot.playlists.length,
    syncedLikes: payload.syncedLikes ?? snapshot.likedSongs.length,
  };
}

export async function syncCloudLibrarySnapshot() {
  const localSource = buildCurrentLocalLibrarySyncSource();
  const remoteSnapshot = await pullCloudLibrarySnapshot();
  const lastSyncedSnapshot = readLastSyncedCloudLibrarySnapshot();

  if (
    hasSnapshotData(remoteSnapshot) &&
    hasSnapshotData(localSource.snapshot)
  ) {
    const mergedSnapshot = lastSyncedSnapshot
      ? mergeCloudLibrarySnapshotsWithBase(
          lastSyncedSnapshot,
          localSource.snapshot,
          remoteSnapshot
        )
      : mergeCloudLibrarySnapshots(localSource.snapshot, remoteSnapshot);

    await restoreCloudLibrary(mergedSnapshot, {
      deferSongMetadataRefresh: true,
    });

    const uploadResult = await pushCloudLibrarySnapshot(mergedSnapshot);
    saveLastSyncedCloudLibrarySnapshot(mergedSnapshot);
    return {
      syncedPlaylists: uploadResult.syncedPlaylists,
      syncedLikes: uploadResult.syncedLikes,
      source: "merged" as const,
    };
  }

  if (hasSnapshotData(remoteSnapshot)) {
    await restoreCloudLibrary(remoteSnapshot, {
      deferSongMetadataRefresh: true,
    });
    saveLastSyncedCloudLibrarySnapshot(remoteSnapshot);

    return {
      syncedPlaylists: remoteSnapshot.playlists.length,
      syncedLikes: remoteSnapshot.likedSongs.length,
      source: "cloud" as const,
    };
  }

  if (!hasSnapshotData(localSource.snapshot)) {
    saveLastSyncedCloudLibrarySnapshot(localSource.snapshot);
    return {
      syncedPlaylists: 0,
      syncedLikes: 0,
      source: "empty" as const,
    };
  }

  const uploadResult = await pushCloudLibrarySnapshot(localSource.snapshot);
  saveLastSyncedCloudLibrarySnapshot(localSource.snapshot);
  return {
    syncedPlaylists: uploadResult.syncedPlaylists,
    syncedLikes: uploadResult.syncedLikes,
    source: "local" as const,
  };
}
