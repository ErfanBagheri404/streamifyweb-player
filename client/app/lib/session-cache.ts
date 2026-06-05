"use client";

type SessionCacheEnvelope<T> = {
  value: T;
  cachedAt: number;
};

export function readSessionCache<T>(key: string, maxAgeMs?: number): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SessionCacheEnvelope<T>;
    if (!parsed || typeof parsed !== "object" || !("value" in parsed)) {
      return null;
    }

    if (
      typeof maxAgeMs === "number" &&
      Number.isFinite(maxAgeMs) &&
      maxAgeMs > 0 &&
      typeof parsed.cachedAt === "number" &&
      Date.now() - parsed.cachedAt > maxAgeMs
    ) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    return parsed.value;
  } catch {
    return null;
  }
}

export function writeSessionCache<T>(key: string, value: T) {
  if (typeof window === "undefined") return;

  try {
    const envelope: SessionCacheEnvelope<T> = {
      value,
      cachedAt: Date.now(),
    };
    window.sessionStorage.setItem(key, JSON.stringify(envelope));
  } catch {}
}
