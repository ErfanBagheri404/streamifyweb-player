export type ProviderEndpoints = {
  instances: {
    piped: string[];
    invidious: string[];
  };
  providers: {
    search: {
      ytifyInstance: string;
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
    itunes: {
      apiBase: string;
    };
    deezer: {
      apiBase: string;
      fallbackProxyPrefix: string;
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

export type ProviderQueryValue = string | number | boolean | null | undefined;

const PROVIDER_ENDPOINTS_URL =
  process.env.NEXT_PUBLIC_STREAMIFY_PROVIDER_ENDPOINTS_URL ||
  process.env.STREAMIFY_PROVIDER_ENDPOINTS_URL ||
  "https://instances.helloify.workers.dev/config";

function createDefaultProviderEndpoints(): ProviderEndpoints {
  return {
    instances: {
      piped: ["https://api.piped.private.coffee"],
      invidious: [
        "https://yt.omada.cafe",
        "https://invidious.schenkel.eti.br",
        "https://invidious.kemonomimi.nl",
        "https://lekker.gay",
      ],
    },
    providers: {
      search: {
        ytifyInstance: "https://api.ytify.workers.dev",
        soundcloudSearchProxyBase: "https://proxy.searchsoundcloud.com",
      },
      jiosaavn: {
        apiBase: "https://streamifyjiosaavn.vercel.app",
        fallbackSearchBase: "https://jiosaavn-api.vercel.app",
        webOrigin: "https://www.jiosaavn.com",
      },
      beatseek: {
        apiBase: "https://beatseek.io/api",
      },
      itunes: {
        apiBase: "https://itunes.apple.com/search",
      },
      deezer: {
        apiBase: "https://api.deezer.com/search",
        fallbackProxyPrefix: "",
      },
      lyrics: {
        lrclibBase: "https://lrclib.net/api",
        lyricsOvhBase: "https://api.lyrics.ovh/v1",
      },
      soundcloud: {
        origin: "https://soundcloud.com",
        mobileOrigin: "https://m.soundcloud.com",
        apiBase: "https://api.soundcloud.com",
        apiV2Base: "https://api-v2.soundcloud.com",
        widgetBase: "https://w.soundcloud.com",
        licenseBase: "https://license.media-streaming.soundcloud.cloud",
        oembedBase: "https://soundcloud.com/oembed",
      },
      youtube: {
        webBase: "https://www.youtube.com",
        musicBase: "https://music.youtube.com",
        oembedBase: "https://www.youtube.com/oembed",
        imageBase: "https://i.ytimg.com",
      },
    },
    headers: {
      origins: {
        soundcloud: "https://soundcloud.com",
        youtube: "https://www.youtube.com",
        jiosaavn: "https://www.jiosaavn.com",
      },
      referers: {
        soundcloud: "https://soundcloud.com/",
        youtube: "https://www.youtube.com/",
        jiosaavn: "https://www.jiosaavn.com/",
      },
    },
  };
}

function cleanUrl(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, "") || "";
}

function cleanText(value: string | undefined): string {
  return value?.trim() || "";
}

function cleanUrlList(values: string[] | undefined): string[] {
  return (values || [])
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeProviderEndpoints(value: unknown): ProviderEndpoints {
  const fallback = createDefaultProviderEndpoints();
  const root = asRecord(value);
  const instances = asRecord(root.instances);
  const providers = asRecord(root.providers);
  const headers = asRecord(root.headers);
  const search = asRecord(providers.search);
  const jiosaavn = asRecord(providers.jiosaavn);
  const beatseek = asRecord(providers.beatseek);
  const itunes = asRecord(providers.itunes);
  const deezer = asRecord(providers.deezer);
  const lyrics = asRecord(providers.lyrics);
  const soundcloud = asRecord(providers.soundcloud);
  const youtube = asRecord(providers.youtube);
  const origins = asRecord(headers.origins);
  const referers = asRecord(headers.referers);

  return {
    instances: {
      piped: dedupeStrings(
        cleanUrlList((instances.piped ?? asRecord(instances.client).piped) as string[] | undefined),
      ),
      invidious: dedupeStrings(
        cleanUrlList((instances.invidious ?? asRecord(instances.client).invidious) as string[] | undefined),
      ),
    },
    providers: {
      search: {
        ytifyInstance: cleanUrl(
          (search.ytifyInstance as string | undefined) ||
            fallback.providers.search.ytifyInstance,
        ),
        soundcloudSearchProxyBase: cleanUrl(
          (search.soundcloudSearchProxyBase as string | undefined) ||
            fallback.providers.search.soundcloudSearchProxyBase,
        ),
      },
      jiosaavn: {
        apiBase: cleanUrl(
          (jiosaavn.apiBase as string | undefined) ||
            fallback.providers.jiosaavn.apiBase,
        ),
        fallbackSearchBase: cleanUrl(
          (jiosaavn.fallbackSearchBase as string | undefined) ||
            fallback.providers.jiosaavn.fallbackSearchBase,
        ),
        webOrigin: cleanUrl(
          (jiosaavn.webOrigin as string | undefined) ||
            fallback.providers.jiosaavn.webOrigin,
        ),
      },
      beatseek: {
        apiBase: cleanUrl(
          (beatseek.apiBase as string | undefined) ||
            fallback.providers.beatseek.apiBase,
        ),
      },
      itunes: {
        apiBase: cleanUrl(
          (itunes.apiBase as string | undefined) ||
            fallback.providers.itunes.apiBase,
        ),
      },
      deezer: {
        apiBase: cleanUrl(
          (deezer.apiBase as string | undefined) ||
            fallback.providers.deezer.apiBase,
        ),
        fallbackProxyPrefix: cleanUrl(
          (deezer.fallbackProxyPrefix as string | undefined) ||
            fallback.providers.deezer.fallbackProxyPrefix,
        ),
      },
      lyrics: {
        lrclibBase: cleanUrl(
          (lyrics.lrclibBase as string | undefined) ||
            fallback.providers.lyrics.lrclibBase,
        ),
        lyricsOvhBase: cleanUrl(
          (lyrics.lyricsOvhBase as string | undefined) ||
            fallback.providers.lyrics.lyricsOvhBase,
        ),
      },
      soundcloud: {
        origin: cleanUrl(
          (soundcloud.origin as string | undefined) ||
            fallback.providers.soundcloud.origin,
        ),
        mobileOrigin: cleanUrl(
          (soundcloud.mobileOrigin as string | undefined) ||
            fallback.providers.soundcloud.mobileOrigin,
        ),
        apiBase: cleanUrl(
          (soundcloud.apiBase as string | undefined) ||
            fallback.providers.soundcloud.apiBase,
        ),
        apiV2Base: cleanUrl(
          (soundcloud.apiV2Base as string | undefined) ||
            fallback.providers.soundcloud.apiV2Base,
        ),
        widgetBase: cleanUrl(
          (soundcloud.widgetBase as string | undefined) ||
            fallback.providers.soundcloud.widgetBase,
        ),
        licenseBase: cleanUrl(
          (soundcloud.licenseBase as string | undefined) ||
            fallback.providers.soundcloud.licenseBase,
        ),
        oembedBase: cleanUrl(
          (soundcloud.oembedBase as string | undefined) ||
            fallback.providers.soundcloud.oembedBase,
        ),
      },
      youtube: {
        webBase: cleanUrl(
          (youtube.webBase as string | undefined) ||
            fallback.providers.youtube.webBase,
        ),
        musicBase: cleanUrl(
          (youtube.musicBase as string | undefined) ||
            fallback.providers.youtube.musicBase,
        ),
        oembedBase: cleanUrl(
          (youtube.oembedBase as string | undefined) ||
            fallback.providers.youtube.oembedBase,
        ),
        imageBase: cleanUrl(
          (youtube.imageBase as string | undefined) ||
            fallback.providers.youtube.imageBase,
        ),
      },
    },
    headers: {
      origins: {
        soundcloud: cleanText(
          (origins.soundcloud as string | undefined) ||
            fallback.headers.origins.soundcloud,
        ),
        youtube: cleanText(
          (origins.youtube as string | undefined) ||
            fallback.headers.origins.youtube,
        ),
        jiosaavn: cleanText(
          (origins.jiosaavn as string | undefined) ||
            fallback.headers.origins.jiosaavn,
        ),
      },
      referers: {
        soundcloud: cleanText(
          (referers.soundcloud as string | undefined) ||
            fallback.headers.referers.soundcloud,
        ),
        youtube: cleanText(
          (referers.youtube as string | undefined) ||
            fallback.headers.referers.youtube,
        ),
        jiosaavn: cleanText(
          (referers.jiosaavn as string | undefined) ||
            fallback.headers.referers.jiosaavn,
        ),
      },
    },
  };
}

function normalizePathVariant(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `/${trimmed.replace(/^\/+/, "")}`;
}

function joinUrlPath(base: string, pathVariant: string): string {
  if (!pathVariant) return cleanUrl(base);

  try {
    const parsed = new URL(base);
    const baseSegments = parsed.pathname.split("/").filter(Boolean);
    const nextSegments = pathVariant.split("/").filter(Boolean);
    let overlap = 0;

    for (
      let size = Math.min(baseSegments.length, nextSegments.length);
      size > 0;
      size -= 1
    ) {
      const baseSuffix = baseSegments.slice(-size).join("/");
      const nextPrefix = nextSegments.slice(0, size).join("/");
      if (baseSuffix.toLowerCase() === nextPrefix.toLowerCase()) {
        overlap = size;
        break;
      }
    }

    parsed.pathname = `/${[
      ...baseSegments,
      ...nextSegments.slice(overlap),
    ].join("/")}`;
    parsed.search = "";
    parsed.hash = "";

    return cleanUrl(parsed.toString());
  } catch {
    return `${cleanUrl(base)}${pathVariant}`;
  }
}

function appendQueryParams(
  value: string,
  query?: Record<string, ProviderQueryValue>,
): string {
  if (!query || !value) return value;

  try {
    const parsed = new URL(value);
    for (const [key, rawValue] of Object.entries(query)) {
      if (rawValue == null || rawValue === "") continue;
      parsed.searchParams.set(key, String(rawValue));
    }
    return parsed.toString();
  } catch {
    return value;
  }
}

export function buildProviderUrlCandidates(
  base: string,
  pathVariants: string[] = [],
  query?: Record<string, ProviderQueryValue>,
): string[] {
  const normalizedBase = cleanUrl(base);
  if (!normalizedBase) return [];

  const candidates = [
    ...pathVariants.map((pathVariant) =>
      joinUrlPath(normalizedBase, normalizePathVariant(pathVariant)),
    ),
    normalizedBase,
  ];

  return dedupeStrings(
    candidates.map((candidate) => appendQueryParams(candidate, query)),
  );
}

const DEFAULT_PROVIDER_ENDPOINTS = createDefaultProviderEndpoints();
let cachedProviderEndpoints = DEFAULT_PROVIDER_ENDPOINTS;
let providerEndpointsPromise: Promise<ProviderEndpoints> | null = null;

export function getCachedProviderEndpointsSnapshot(): ProviderEndpoints {
  return cachedProviderEndpoints;
}

export async function getProviderEndpoints(options?: {
  revalidate?: boolean;
}): Promise<ProviderEndpoints> {
  if (!providerEndpointsPromise || options?.revalidate) {
    providerEndpointsPromise = fetch(PROVIDER_ENDPOINTS_URL, {
      cache: options?.revalidate ? "no-store" : "default",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to fetch provider endpoints: ${response.status}`,
          );
        }

        const payload = normalizeProviderEndpoints(await response.json());
        cachedProviderEndpoints = payload;
        return payload;
      })
      .catch((error) => {
        providerEndpointsPromise = null;
        throw error;
      });
  }

  return providerEndpointsPromise;
}
