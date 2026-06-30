import {
  getCachedRuntimeConfigSnapshot,
  getRuntimeConfig,
  type StreamifyRuntimeConfig,
} from "./runtime-config";

export type StreamifyBackendApiMode = "same-origin" | "absolute";

export type StreamifyBackendApiSettings = {
  mode: StreamifyBackendApiMode;
  baseUrl: string | null;
  allowedOrigins: string[];
  absoluteRoutes: string[];
};

type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean>;

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanUrl(value: string | undefined | null): string {
  return value?.trim().replace(/\/+$/, "") || "";
}

function cleanText(value: string | undefined | null): string {
  return value?.trim() || "";
}

function cleanOriginList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value
    .map((entry) => cleanUrl(typeof entry === "string" ? entry : ""))
    .filter((entry) => {
      if (!entry || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

function cleanPathList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value
    .map((entry) =>
      normalizeBackendRoutePath(typeof entry === "string" ? entry : "")
    )
    .filter((entry) => {
      if (!entry || entry === "/" || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

function parseEnvRouteList(value: string | undefined): string[] {
  if (!value) return [];

  return cleanPathList(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

function normalizeMode(
  value: string | undefined,
  baseUrl: string
): StreamifyBackendApiMode {
  return value === "absolute" && Boolean(baseUrl) ? "absolute" : "same-origin";
}

function readRuntimeConfigApiSettings(
  runtimeConfig: StreamifyRuntimeConfig | null
): StreamifyBackendApiSettings {
  const extra = toRecord(runtimeConfig?.extra);
  const extraApi = toRecord(extra.api);
  const topLevelApi = runtimeConfig?.api || {};
  const baseUrl = cleanUrl(
    topLevelApi.baseUrl ||
      (typeof extraApi.baseUrl === "string" ? extraApi.baseUrl : "")
  );
  const mode = normalizeMode(
    cleanText(
      topLevelApi.mode ||
        (typeof extraApi.mode === "string" ? extraApi.mode : "")
    ).toLowerCase(),
    baseUrl
  );
  const allowedOrigins = cleanOriginList(
    topLevelApi.allowedOrigins || extraApi.allowedOrigins
  );
  const absoluteRoutes = cleanPathList(
    topLevelApi.absoluteRoutes || extraApi.absoluteRoutes
  );

  return {
    mode,
    baseUrl: mode === "absolute" ? baseUrl : null,
    allowedOrigins,
    absoluteRoutes,
  };
}

function readEnvApiSettings(): StreamifyBackendApiSettings {
  const baseUrl = cleanUrl(
    process.env.NEXT_PUBLIC_STREAMIFY_API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.STREAMIFY_API_BASE_URL ||
      process.env.API_BASE_URL
  );
  const mode = normalizeMode(
    cleanText(
      process.env.NEXT_PUBLIC_STREAMIFY_API_MODE ||
        process.env.NEXT_PUBLIC_API_MODE ||
        process.env.STREAMIFY_API_MODE ||
        process.env.API_MODE
    ).toLowerCase(),
    baseUrl
  );

  return {
    mode,
    baseUrl: mode === "absolute" ? baseUrl : null,
    allowedOrigins: [],
    absoluteRoutes: parseEnvRouteList(
      process.env.NEXT_PUBLIC_STREAMIFY_API_ROUTES ||
        process.env.STREAMIFY_API_ROUTES ||
        process.env.NEXT_PUBLIC_API_ROUTES ||
        process.env.API_ROUTES
    ),
  };
}

function mergeApiSettings(
  runtimeConfig: StreamifyRuntimeConfig | null
): StreamifyBackendApiSettings {
  const runtimeSettings = readRuntimeConfigApiSettings(runtimeConfig);
  const envSettings = readEnvApiSettings();

  if (runtimeSettings.mode === "absolute" && runtimeSettings.baseUrl) {
    return runtimeSettings;
  }

  if (envSettings.mode === "absolute" && envSettings.baseUrl) {
    return envSettings;
  }

  return {
    mode: "same-origin",
    baseUrl: null,
    allowedOrigins:
      runtimeSettings.allowedOrigins.length > 0
        ? runtimeSettings.allowedOrigins
        : envSettings.allowedOrigins,
    absoluteRoutes:
      runtimeSettings.absoluteRoutes.length > 0
        ? runtimeSettings.absoluteRoutes
        : envSettings.absoluteRoutes,
  };
}

function normalizeBackendRoutePath(path: string): string {
  const trimmed = cleanText(path);
  if (!trimmed) return "/";

  const normalized = `/${trimmed.replace(/^\/+/, "")}`;
  if (normalized === "/api") return "/";
  if (normalized.startsWith("/api/")) {
    return normalized.slice(4) || "/";
  }

  return normalized;
}

function joinBaseWithPath(baseUrl: string, path: string): string {
  const parsed = new URL(baseUrl);
  const basePath = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = `${basePath}${path === "/" ? "" : path}` || "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function appendSearchParams(
  value: string,
  searchParams?: URLSearchParams | Record<string, QueryValue>
): string {
  if (!searchParams) return value;

  const url = new URL(value, "http://streamify.local");
  if (searchParams instanceof URLSearchParams) {
    searchParams.forEach((paramValue, key) => {
      url.searchParams.append(key, paramValue);
    });
  } else {
    for (const [key, rawValue] of Object.entries(searchParams)) {
      if (rawValue == null || rawValue === "") continue;
      if (Array.isArray(rawValue)) {
        for (const entry of rawValue) {
          if (entry == null || entry === "") continue;
          url.searchParams.append(key, String(entry));
        }
        continue;
      }
      url.searchParams.set(key, String(rawValue));
    }
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return url.toString();
  }

  return `${url.pathname}${url.search}`;
}

export function getCachedBackendApiSettings(): StreamifyBackendApiSettings {
  return mergeApiSettings(getCachedRuntimeConfigSnapshot());
}

export async function getBackendApiSettings(options?: {
  revalidate?: boolean;
}): Promise<StreamifyBackendApiSettings> {
  try {
    return mergeApiSettings(await getRuntimeConfig(options));
  } catch {
    return getCachedBackendApiSettings();
  }
}

export function buildBackendRouteUrl(
  path: string,
  options?: {
    searchParams?: URLSearchParams | Record<string, QueryValue>;
    settings?: StreamifyBackendApiSettings;
  }
): string {
  const settings = options?.settings || getCachedBackendApiSettings();
  const normalizedPath = normalizeBackendRoutePath(path);
  const useAbsoluteRoute =
    settings.mode === "absolute" &&
    Boolean(settings.baseUrl) &&
    (settings.absoluteRoutes.length === 0 ||
      settings.absoluteRoutes.includes(normalizedPath));
  const baseValue =
    useAbsoluteRoute && settings.baseUrl
      ? joinBaseWithPath(settings.baseUrl, normalizedPath)
      : `/api${normalizedPath === "/" ? "" : normalizedPath}`;

  return appendSearchParams(baseValue, options?.searchParams);
}

export async function buildBackendRouteUrlAsync(
  path: string,
  options?: {
    searchParams?: URLSearchParams | Record<string, QueryValue>;
    settings?: StreamifyBackendApiSettings;
    revalidate?: boolean;
  }
): Promise<string> {
  const settings =
    options?.settings ||
    (await getBackendApiSettings({ revalidate: options?.revalidate }));
  return buildBackendRouteUrl(path, {
    searchParams: options?.searchParams,
    settings,
  });
}

export function buildAudioProxyUrl(audioUrl: string): string {
  return buildBackendRouteUrl("/audio-proxy", {
    searchParams: { url: audioUrl },
  });
}

export function buildLicenseProxyUrl(licenseUrl: string): string {
  return buildBackendRouteUrl("/license-proxy", {
    searchParams: { url: licenseUrl },
  });
}
