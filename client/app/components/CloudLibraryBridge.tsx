"use client";

import { useEffect, useMemo } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/browser";
import {
  createCloudLibrarySnapshot,
  mergeCloudLibrarySnapshots,
  readLikedSongs,
  readStoredPlaylists,
  restoreCloudLibrary,
} from "../lib/local-library";

const CLOUD_LIBRARY_RESTORE_PREFIX = "streamify-cloud-library-restored";

function getCloudLibraryRestoreKey(userId: string) {
  return `${CLOUD_LIBRARY_RESTORE_PREFIX}:${userId}`;
}

function hasRestoredCloudLibrary(userId: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    return (
      window.sessionStorage.getItem(getCloudLibraryRestoreKey(userId)) === "1"
    );
  } catch {
    return false;
  }
}

function markCloudLibraryRestored(userId: string) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(getCloudLibraryRestoreKey(userId), "1");
  } catch {}
}

function clearCloudLibraryRestoreMark(userId: string) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(getCloudLibraryRestoreKey(userId));
  } catch {}
}

function clearAllCloudLibraryRestoreMarks() {
  if (typeof window === "undefined") return;

  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(`${CLOUD_LIBRARY_RESTORE_PREFIX}:`)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      const userId = key.slice(CLOUD_LIBRARY_RESTORE_PREFIX.length + 1);
      if (userId) {
        clearCloudLibraryRestoreMark(userId);
      }
    }
  } catch {}
}

function hasLocalLibraryData(): boolean {
  return readStoredPlaylists().length > 0 || readLikedSongs().length > 0;
}

function buildLocalLibrarySnapshot() {
  const playlists = readStoredPlaylists();
  const likedSongs = readLikedSongs();

  return createCloudLibrarySnapshot(playlists, likedSongs);
}

function hasCloudLibraryData(snapshot: {
  playlists?: unknown[];
  likedSongs?: unknown[];
}): boolean {
  return Array.isArray(snapshot.playlists) || Array.isArray(snapshot.likedSongs)
    ? (snapshot.playlists?.length || 0) > 0 ||
        (snapshot.likedSongs?.length || 0) > 0
    : false;
}

export default function CloudLibraryBridge() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  useEffect(() => {
    let isMounted = true;

    if (!supabase) {
      return;
    }

    const restoreLibrary = async (userId: string) => {
      if (hasRestoredCloudLibrary(userId)) {
        return;
      }

      try {
        const response = await fetch("/api/library/sync", {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) return;

        const payload = (await response.json()) as {
          playlists?: unknown[];
          likedSongs?: unknown[];
        };
        if (!isMounted) return;

        if (!hasCloudLibraryData(payload)) {
          markCloudLibraryRestored(userId);
          return;
        }

        const remoteSnapshot = payload as Parameters<
          typeof mergeCloudLibrarySnapshots
        >[1];
        const hasLocalData = hasLocalLibraryData();
        const nextSnapshot = hasLocalData
          ? mergeCloudLibrarySnapshots(
              buildLocalLibrarySnapshot(),
              remoteSnapshot
            )
          : remoteSnapshot;

        await restoreCloudLibrary(nextSnapshot);
        markCloudLibraryRestored(userId);
      } catch {}
    };

    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted || !user) return;
      await restoreLibrary(user.id);
    };

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clearAllCloudLibraryRestoreMarks();
        return;
      }

      const userId = session?.user?.id;
      if (!isMounted) return;
      if (!userId) return;
      if (event !== "SIGNED_IN") return;
      void restoreLibrary(userId);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return null;
}
