import {
  createCloudLibrarySnapshot,
  readLikedSongs,
  readStoredPlaylists,
  restoreCloudLibrary,
  type CloudLibrarySnapshot,
} from "./local-library";

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
  const remoteSnapshot = await pullCloudLibrarySnapshot();

  if (hasSnapshotData(remoteSnapshot)) {
    await restoreCloudLibrary(remoteSnapshot, {
      deferSongMetadataRefresh: true,
    });

    return {
      syncedPlaylists: remoteSnapshot.playlists.length,
      syncedLikes: remoteSnapshot.likedSongs.length,
      source: "cloud" as const,
    };
  }

  const localSource = buildCurrentLocalLibrarySyncSource();
  if (!hasSnapshotData(localSource.snapshot)) {
    return {
      syncedPlaylists: 0,
      syncedLikes: 0,
      source: "empty" as const,
    };
  }

  const uploadResult = await pushCloudLibrarySnapshot(localSource.snapshot);
  return {
    syncedPlaylists: uploadResult.syncedPlaylists,
    syncedLikes: uploadResult.syncedLikes,
    source: "local" as const,
  };
}
