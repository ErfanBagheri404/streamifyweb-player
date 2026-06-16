import {
  createCloudLibrarySnapshot,
  mergeCloudLibrarySnapshots,
  readLikedSongs,
  readStoredPlaylists,
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

async function fetchCloudLibrarySnapshot(): Promise<CloudLibrarySnapshot> {
  const response = await fetch("/api/library/sync", {
    method: "GET",
    cache: "no-store",
  });

  const payload = (await response.json()) as CloudLibrarySnapshot & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Failed to load cloud library");
  }

  return {
    playlists: Array.isArray(payload.playlists) ? payload.playlists : [],
    likedSongs: Array.isArray(payload.likedSongs) ? payload.likedSongs : [],
  };
}

export async function pushCloudLibrarySnapshot(snapshot: CloudLibrarySnapshot) {
  let mergedSnapshot = snapshot;

  try {
    const remoteSnapshot = await fetchCloudLibrarySnapshot();
    mergedSnapshot = mergeCloudLibrarySnapshots(snapshot, remoteSnapshot);
  } catch {
    mergedSnapshot = snapshot;
  }

  const response = await fetch("/api/library/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mergedSnapshot),
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
    syncedPlaylists: payload.syncedPlaylists ?? mergedSnapshot.playlists.length,
    syncedLikes: payload.syncedLikes ?? mergedSnapshot.likedSongs.length,
  };
}
