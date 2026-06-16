import {
  createCloudLibrarySnapshot,
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
    syncedPlaylists: payload.syncedPlaylists ?? 0,
    syncedLikes: payload.syncedLikes ?? 0,
  };
}
