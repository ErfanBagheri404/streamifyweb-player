export interface StreamifyRuntimeConfig {
  app: {
    name: string;
    env: string;
    version: string;
    updatedAt: string;
    siteUrl: string;
    origin: string;
  };
  instances: {
    client: {
      piped: string[];
      invidious: string[];
    };
    server: {
      localProxyBase: string;
      localExpressApiUrl: string;
      localAllowedClientOrigin: string;
    };
  };
  providers: {
    search: {
      ytifyInstance: string;
      searchBackendUrl: string;
      soundcloudSearchProxyBase: string;
    };
    jiosaavn: {
      apiBase: string;
      fallbackSearchBase: string;
      webOrigin: string;
    };
    beatseek: {
      apiBase: string;
    };
    lyrics: {
      lrclibBase: string;
      lyricsOvhBase: string;
    };
    soundcloud: {
      origin: string;
      mobileOrigin: string;
      apiBase: string;
      apiV2Base: string;
      widgetBase: string;
      licenseBase: string;
      oembedBase: string;
    };
    youtube: {
      webBase: string;
      musicBase: string;
      oembedBase: string;
      imageBase: string;
    };
    supabase: {
      url: string;
    };
    mobile: {
      androidAppUrl: string;
    };
  };
  headers: {
    origins: Record<string, string>;
    referers: Record<string, string>;
  };
  curated: {
    categoryPlaylists: Array<Record<string, unknown>>;
  };
  extra: Record<string, unknown>;
}

let runtimeConfigPromise: Promise<StreamifyRuntimeConfig> | null = null;
const RUNTIME_CONFIG_CACHE_KEY = "streamify-runtime-config-cache";
const DEFAULT_RUNTIME_CONFIG_URL =
  "https://streamifyinstances.erfannodes.workers.dev/config";
const RUNTIME_CONFIG_TTL_MS = 5 * 60 * 1000;
let memoryCachedRuntimeConfig: RuntimeConfigCacheRecord | null = null;

type RuntimeConfigCacheRecord = {
  etag?: string;
  payload: StreamifyRuntimeConfig;
  cachedAt: number;
};

function getRuntimeConfigUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_STREAMIFY_CONFIG_URL?.trim() ||
    process.env.STREAMIFY_CONFIG_URL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_RUNTIME_CONFIG_URL;
}

function getServerFetchSecret(): string {
  if (typeof window !== "undefined") return "";

  return (
    process.env.STREAMIFY_SERVER_FETCH_SECRET?.trim() ||
    process.env.SERVER_FETCH_SECRET?.trim() ||
    ""
  );
}

export function resetRuntimeConfigCache() {
  runtimeConfigPromise = null;
}

function isRuntimeConfigFresh(cache: RuntimeConfigCacheRecord | null): boolean {
  return Boolean(cache && Date.now() - cache.cachedAt < RUNTIME_CONFIG_TTL_MS);
}

function readCachedRuntimeConfig(): RuntimeConfigCacheRecord | null {
  if (typeof window === "undefined") {
    return memoryCachedRuntimeConfig;
  }

  try {
    const raw = window.localStorage.getItem(RUNTIME_CONFIG_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RuntimeConfigCacheRecord;
  } catch {
    return null;
  }
}

export function getCachedRuntimeConfigSnapshot(): StreamifyRuntimeConfig | null {
  return readCachedRuntimeConfig()?.payload || null;
}

function writeCachedRuntimeConfig(cache: RuntimeConfigCacheRecord) {
  if (typeof window === "undefined") {
    memoryCachedRuntimeConfig = cache;
    return;
  }

  try {
    window.localStorage.setItem(
      RUNTIME_CONFIG_CACHE_KEY,
      JSON.stringify(cache)
    );
  } catch {}
}

async function fetchRuntimeConfig(
  cached: RuntimeConfigCacheRecord | null
): Promise<StreamifyRuntimeConfig> {
  try {
    const serverFetchSecret = getServerFetchSecret();
    const response = await fetch(getRuntimeConfigUrl(), {
      headers: {
        Accept: "application/json",
        ...(cached?.etag ? { "If-None-Match": cached.etag } : {}),
        ...(serverFetchSecret
          ? { "x-streamify-server-secret": serverFetchSecret }
          : {}),
      },
      cache: "no-store",
    });

    if (response.status === 304 && cached?.payload) {
      writeCachedRuntimeConfig({
        ...cached,
        cachedAt: Date.now(),
      });
      return cached.payload;
    }

    const payload = (await response.json()) as StreamifyRuntimeConfig & {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error || "Failed to load runtime config");
    }

    writeCachedRuntimeConfig({
      etag: response.headers.get("ETag") || cached?.etag || undefined,
      payload,
      cachedAt: Date.now(),
    });

    return payload;
  } catch (error) {
    if (cached?.payload) {
      return cached.payload;
    }
    throw error;
  }
}

export async function getRuntimeConfig(options?: {
  revalidate?: boolean;
}): Promise<StreamifyRuntimeConfig> {
  const cached = readCachedRuntimeConfig();

  if (cached?.payload && !options?.revalidate && isRuntimeConfigFresh(cached)) {
    return cached.payload;
  }

  if (runtimeConfigPromise) {
    return runtimeConfigPromise;
  }

  runtimeConfigPromise = fetchRuntimeConfig(cached);

  try {
    return await runtimeConfigPromise;
  } finally {
    runtimeConfigPromise = null;
  }
}

export async function primeRuntimeConfig(): Promise<StreamifyRuntimeConfig> {
  return getRuntimeConfig({ revalidate: true });
}
