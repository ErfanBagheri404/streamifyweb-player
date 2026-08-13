"use client";

import { useEffect, useMemo } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/browser";
import {
  clearLastSyncedCloudLibrarySnapshot,
  saveLastSyncedCloudLibrarySnapshot,
  syncCloudLibrarySnapshot,
} from "../lib/cloud-library-sync";
import {
  createCloudLibrarySnapshot,
  LOCAL_LIBRARY_UPDATED_EVENT,
  mergeCloudLibrarySnapshots,
  readLikedSongs,
  readStoredPlaylists,
  restoreCloudLibrary,
} from "../lib/local-library";

const AUTO_SYNC_DEBOUNCE_MS = 1200;

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
          saveLastSyncedCloudLibrarySnapshot({
            playlists: [],
            likedSongs: [],
          });
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

        await restoreCloudLibrary(nextSnapshot, {
          deferSongMetadataRefresh: true,
        });
        saveLastSyncedCloudLibrarySnapshot(nextSnapshot);
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
        clearLastSyncedCloudLibrarySnapshot();
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    let isMounted = true;
    let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;
    let isAutoSyncing = false;
    let pendingAutoSync = false;
    let isApplyingRemote = false;

    const runAutoSync = async () => {
      if (isAutoSyncing) {
        pendingAutoSync = true;
        return;
      }

      isAutoSyncing = true;
      isApplyingRemote = true;
      try {
        await syncCloudLibrarySnapshot();
      } catch {
        // Auto-sync failures are non-fatal; the next trigger retries.
      } finally {
        isApplyingRemote = false;
        isAutoSyncing = false;
        if (pendingAutoSync && isMounted) {
          pendingAutoSync = false;
          void runAutoSync();
        }
      }
    };

    const scheduleAutoSync = () => {
      if (!isMounted || isApplyingRemote) return;
      if (autoSyncTimer) clearTimeout(autoSyncTimer);
      autoSyncTimer = setTimeout(() => {
        void runAutoSync();
      }, AUTO_SYNC_DEBOUNCE_MS);
    };

    window.addEventListener(LOCAL_LIBRARY_UPDATED_EVENT, scheduleAutoSync);

    return () => {
      isMounted = false;
      if (autoSyncTimer) clearTimeout(autoSyncTimer);
      window.removeEventListener(
        LOCAL_LIBRARY_UPDATED_EVENT,
        scheduleAutoSync
      );
    };
  }, []);

  return null;
}
