"use client";

type SessionCacheEnvelope<T> = {
  value: T;
  cachedAt: number;
};

function getStorageBackends(): Storage[] {
  if (typeof window === "undefined") return [];

  const backends: Storage[] = [];

  try {
    backends.push(window.localStorage);
  } catch {}

  try {
    backends.push(window.sessionStorage);
  } catch {}

  return backends;
}

export function readSessionCache<T>(key: string, maxAgeMs?: number): T | null {
  for (const storage of getStorageBackends()) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as SessionCacheEnvelope<T>;
      if (!parsed || typeof parsed !== "object" || !("value" in parsed)) {
        continue;
      }

      if (
        typeof maxAgeMs === "number" &&
        Number.isFinite(maxAgeMs) &&
        maxAgeMs > 0 &&
        typeof parsed.cachedAt === "number" &&
        Date.now() - parsed.cachedAt > maxAgeMs
      ) {
        for (const backend of getStorageBackends()) {
          try {
            backend.removeItem(key);
          } catch {}
        }
        return null;
      }

      return parsed.value;
    } catch {}
  }

  return null;
}

export function writeSessionCache<T>(key: string, value: T) {
  const envelope: SessionCacheEnvelope<T> = {
    value,
    cachedAt: Date.now(),
  };

  for (const storage of getStorageBackends()) {
    try {
      storage.setItem(key, JSON.stringify(envelope));
    } catch {}
  }
}
