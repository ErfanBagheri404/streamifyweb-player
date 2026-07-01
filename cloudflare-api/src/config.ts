export interface WorkerEnv {
  CONFIG_URL?: string;
  STREAMIFY_SERVER_FETCH_SECRET?: string;
  SERVER_FETCH_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  WORKER_ENV?: string;
}

type WorkerRuntimeConfig = {
  api?: {
    allowedOrigins?: string[];
    proxy?: {
      allowedAudioHosts?: string[];
      allowedLicenseHosts?: string[];
    };
  };
  instances?: {
    client?: {
      piped?: string[];
      invidious?: string[];
    };
  };
  providers?: {
    search?: {
      ytifyInstance?: string;
      soundcloudSearchProxyBase?: string;
    };
    beatseek?: {
      apiBase?: string;
    };
    jiosaavn?: {
      apiBase?: string;
      fallbackSearchBase?: string;
      webOrigin?: string;
    };
    lyrics?: {
      lrclibBase?: string;
      lyricsOvhBase?: string;
    };
    soundcloud?: {
      clientId?: string;
      origin?: string;
      mobileOrigin?: string;
      apiBase?: string;
      apiV2Base?: string;
      widgetBase?: string;
      licenseBase?: string;
      oembedBase?: string;
    };
    youtube?: {
      webBase?: string;
      musicBase?: string;
      oembedBase?: string;
      imageBase?: string;
    };
  };
  headers?: {
    origins?: Record<string, string>;
    referers?: Record<string, string>;
  };
};

export type WorkerConfig = {
  api: {
    allowedOrigins: string[];
    proxy: {
      allowedAudioHosts: string[];
      allowedLicenseHosts: string[];
    };
  };
  instances: {
    piped: string[];
    invidious: string[];
  };
  providers: {
    search: {
      ytifyInstance: string;
      soundcloudSearchProxyBase: string;
    };
    beatseek: {
      apiBase: string;
    };
    jiosaavn: {
      apiBase: string;
      fallbackSearchBase: string;
      webOrigin: string;
    };
    lyrics: {
      lrclibBase: string;
      lyricsOvhBase: string;
    };
    soundcloud: {
      clientId: string;
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
  };
  headers: {
    origins: {
      soundcloud: string;
      youtube: string;
      jiosaavn: string;
    };
    referers: {
      soundcloud: string;
      youtube: string;
      jiosaavn: string;
    };
  };
};

const DEFAULT_CONFIG_URL =
  "https://streamifyinstances.erfannodes.workers.dev/config";
const CONFIG_TTL_MS = 5 * 60 * 1000;

const DEFAULT_CONFIG: WorkerConfig = {
  api: {
    allowedOrigins: [],
    proxy: {
      allowedAudioHosts: [],
      allowedLicenseHosts: [],
    },
  },
  instances: {
    piped: [],
    invidious: [],
  },
  providers: {
    search: {
      ytifyInstance: "",
      soundcloudSearchProxyBase: "",
    },
    beatseek: {
      apiBase: "",
    },
    jiosaavn: {
      apiBase: "",
      fallbackSearchBase: "",
      webOrigin: "",
    },
    lyrics: {
      lrclibBase: "",
      lyricsOvhBase: "",
    },
    soundcloud: {
      clientId: "",
      origin: "",
      mobileOrigin: "",
      apiBase: "",
      apiV2Base: "",
      widgetBase: "",
      licenseBase: "",
      oembedBase: "",
    },
    youtube: {
      webBase: "",
      musicBase: "",
      oembedBase: "",
      imageBase: "",
    },
  },
  headers: {
    origins: {
      soundcloud: "",
      youtube: "",
      jiosaavn: "",
    },
    referers: {
      soundcloud: "",
      youtube: "",
      jiosaavn: "",
    },
  },
};

let cachedConfig: { value: WorkerConfig; expiresAt: number } | null = null;

function cleanUrl(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, "") || "";
}

function cleanText(value: string | undefined): string {
  return value?.trim() || "";
}

function cleanHostname(value: string | undefined): string {
  const trimmed = value?.trim() || "";
  if (!trimmed) return "";

  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return trimmed
      .replace(/^[a-z]+:\/\//i, "")
      .replace(/[/?#].*$/, "")
      .trim()
      .toLowerCase();
  }
}

function cleanUrlList(values: string[] | undefined): string[] {
  return [
    ...new Set((values || []).map((value) => cleanUrl(value)).filter(Boolean)),
  ];
}

function cleanHostnameList(values: string[] | undefined): string[] {
  return [
    ...new Set(
      (values || []).map((value) => cleanHostname(value)).filter(Boolean)
    ),
  ];
}

function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return cleanUrlList(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

export function buildProviderUrlCandidates(
  base: string,
  pathVariants: string[] = [],
  query?: Record<string, string | number | boolean | null | undefined>
): string[] {
  const normalizedBase = cleanUrl(base);
  if (!normalizedBase) return [];

  const buildJoinedUrl = (pathVariant: string) => {
    const parsed = new URL(normalizedBase);
    const basePath = parsed.pathname.replace(/\/+$/, "");
    const nextPath = `/${pathVariant.replace(/^\/+/, "")}`;
    parsed.pathname = `${basePath}${nextPath}`;
    parsed.search = "";
    parsed.hash = "";
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value == null || value === "") continue;
        parsed.searchParams.set(key, String(value));
      }
    }
    return parsed.toString();
  };

  const candidates = [
    ...pathVariants.map((pathVariant) => buildJoinedUrl(pathVariant)),
    normalizedBase,
  ];

  return [...new Set(candidates)];
}

function readConfigErrorText(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const errorValue = (payload as { error?: unknown }).error;
    if (typeof errorValue === "string" && errorValue.trim()) {
      return errorValue.trim();
    }
  }

  return fallback;
}

async function fetchRemoteConfig(env: WorkerEnv): Promise<WorkerRuntimeConfig> {
  const configUrl = cleanUrl(env.CONFIG_URL) || DEFAULT_CONFIG_URL;
  const headers = new Headers({ Accept: "application/json" });
  const serverSecret = cleanText(
    env.STREAMIFY_SERVER_FETCH_SECRET || env.SERVER_FETCH_SECRET
  );
  if (serverSecret) {
    headers.set("x-streamify-server-secret", serverSecret);
  }

  const response = await fetch(configUrl, { headers });
  const rawBody = await response.text();
  let parsedBody: unknown = null;

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = null;
    }
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch runtime config from ${configUrl}: ${response.status} ${
        response.statusText
      } (${readConfigErrorText(parsedBody, rawBody || "No response body")})`
    );
  }

  if (!parsedBody || typeof parsedBody !== "object") {
    throw new Error(
      `Runtime config from ${configUrl} did not return a valid JSON object`
    );
  }

  return parsedBody as WorkerRuntimeConfig;
}

function mergeConfig(
  remoteConfig: WorkerRuntimeConfig | null,
  env: WorkerEnv
): WorkerConfig {
  const allowedOriginsFromEnv = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const allowedOriginsFromConfig = cleanUrlList(
    remoteConfig?.api?.allowedOrigins
  );

  return {
    api: {
      allowedOrigins:
        allowedOriginsFromEnv.length > 0
          ? allowedOriginsFromEnv
          : allowedOriginsFromConfig,
      proxy: {
        allowedAudioHosts: cleanHostnameList(
          remoteConfig?.api?.proxy?.allowedAudioHosts
        ),
        allowedLicenseHosts: cleanHostnameList(
          remoteConfig?.api?.proxy?.allowedLicenseHosts
        ),
      },
    },
    instances: {
      piped:
        cleanUrlList(remoteConfig?.instances?.client?.piped).length > 0
          ? cleanUrlList(remoteConfig?.instances?.client?.piped)
          : DEFAULT_CONFIG.instances.piped,
      invidious:
        cleanUrlList(remoteConfig?.instances?.client?.invidious).length > 0
          ? cleanUrlList(remoteConfig?.instances?.client?.invidious)
          : DEFAULT_CONFIG.instances.invidious,
    },
    providers: {
      search: {
        ytifyInstance:
          cleanUrl(remoteConfig?.providers?.search?.ytifyInstance) ||
          DEFAULT_CONFIG.providers.search.ytifyInstance,
        soundcloudSearchProxyBase:
          cleanUrl(
            remoteConfig?.providers?.search?.soundcloudSearchProxyBase
          ) || DEFAULT_CONFIG.providers.search.soundcloudSearchProxyBase,
      },
      beatseek: {
        apiBase:
          cleanUrl(remoteConfig?.providers?.beatseek?.apiBase) ||
          DEFAULT_CONFIG.providers.beatseek.apiBase,
      },
      jiosaavn: {
        apiBase:
          cleanUrl(remoteConfig?.providers?.jiosaavn?.apiBase) ||
          DEFAULT_CONFIG.providers.jiosaavn.apiBase,
        fallbackSearchBase:
          cleanUrl(remoteConfig?.providers?.jiosaavn?.fallbackSearchBase) ||
          DEFAULT_CONFIG.providers.jiosaavn.fallbackSearchBase,
        webOrigin:
          cleanUrl(remoteConfig?.providers?.jiosaavn?.webOrigin) ||
          DEFAULT_CONFIG.providers.jiosaavn.webOrigin,
      },
      lyrics: {
        lrclibBase:
          cleanUrl(remoteConfig?.providers?.lyrics?.lrclibBase) ||
          DEFAULT_CONFIG.providers.lyrics.lrclibBase,
        lyricsOvhBase:
          cleanUrl(remoteConfig?.providers?.lyrics?.lyricsOvhBase) ||
          DEFAULT_CONFIG.providers.lyrics.lyricsOvhBase,
      },
      soundcloud: {
        clientId:
          cleanText(remoteConfig?.providers?.soundcloud?.clientId) ||
          DEFAULT_CONFIG.providers.soundcloud.clientId,
        origin:
          cleanUrl(remoteConfig?.providers?.soundcloud?.origin) ||
          DEFAULT_CONFIG.providers.soundcloud.origin,
        mobileOrigin:
          cleanUrl(remoteConfig?.providers?.soundcloud?.mobileOrigin) ||
          DEFAULT_CONFIG.providers.soundcloud.mobileOrigin,
        apiBase:
          cleanUrl(remoteConfig?.providers?.soundcloud?.apiBase) ||
          DEFAULT_CONFIG.providers.soundcloud.apiBase,
        apiV2Base:
          cleanUrl(remoteConfig?.providers?.soundcloud?.apiV2Base) ||
          DEFAULT_CONFIG.providers.soundcloud.apiV2Base,
        widgetBase:
          cleanUrl(remoteConfig?.providers?.soundcloud?.widgetBase) ||
          DEFAULT_CONFIG.providers.soundcloud.widgetBase,
        licenseBase:
          cleanUrl(remoteConfig?.providers?.soundcloud?.licenseBase) ||
          DEFAULT_CONFIG.providers.soundcloud.licenseBase,
        oembedBase:
          cleanUrl(remoteConfig?.providers?.soundcloud?.oembedBase) ||
          DEFAULT_CONFIG.providers.soundcloud.oembedBase,
      },
      youtube: {
        webBase:
          cleanUrl(remoteConfig?.providers?.youtube?.webBase) ||
          DEFAULT_CONFIG.providers.youtube.webBase,
        musicBase:
          cleanUrl(remoteConfig?.providers?.youtube?.musicBase) ||
          DEFAULT_CONFIG.providers.youtube.musicBase,
        oembedBase:
          cleanUrl(remoteConfig?.providers?.youtube?.oembedBase) ||
          DEFAULT_CONFIG.providers.youtube.oembedBase,
        imageBase:
          cleanUrl(remoteConfig?.providers?.youtube?.imageBase) ||
          DEFAULT_CONFIG.providers.youtube.imageBase,
      },
    },
    headers: {
      origins: {
        soundcloud:
          cleanUrl(remoteConfig?.headers?.origins?.soundcloud) ||
          DEFAULT_CONFIG.headers.origins.soundcloud,
        youtube:
          cleanUrl(remoteConfig?.headers?.origins?.youtube) ||
          DEFAULT_CONFIG.headers.origins.youtube,
        jiosaavn:
          cleanUrl(remoteConfig?.headers?.origins?.jiosaavn) ||
          DEFAULT_CONFIG.headers.origins.jiosaavn,
      },
      referers: {
        soundcloud:
          cleanText(remoteConfig?.headers?.referers?.soundcloud) ||
          DEFAULT_CONFIG.headers.referers.soundcloud,
        youtube:
          cleanText(remoteConfig?.headers?.referers?.youtube) ||
          DEFAULT_CONFIG.headers.referers.youtube,
        jiosaavn:
          cleanText(remoteConfig?.headers?.referers?.jiosaavn) ||
          DEFAULT_CONFIG.headers.referers.jiosaavn,
      },
    },
  };
}

export async function getWorkerConfig(env: WorkerEnv): Promise<WorkerConfig> {
  if (cachedConfig && cachedConfig.expiresAt > Date.now()) {
    return cachedConfig.value;
  }

  const value = mergeConfig(await fetchRemoteConfig(env), env);
  cachedConfig = {
    value,
    expiresAt: Date.now() + CONFIG_TTL_MS,
  };
  return value;
}
