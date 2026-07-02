export type StreamifyBackendApiMode = "same-origin" | "absolute";

export type StreamifyBackendApiSettings = {
  mode: StreamifyBackendApiMode;
  baseUrl: string | null;
  baseUrls: string[];
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

function cleanUrl(value: string | undefined | null): string {
  return value?.trim().replace(/\/+$/, "") || "";
}

function cleanText(value: string | undefined | null): string {
  return value?.trim() || "";
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
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

function parseEnvBaseUrlList(value: string | undefined): string[] {
  if (!value) return [];

  return dedupeStrings(
    value
      .split(",")
      .map((entry) => cleanUrl(entry))
      .filter(Boolean)
  );
}

function normalizeMode(
  value: string | undefined,
  baseUrls: string[]
): StreamifyBackendApiMode {
  return value === "absolute" && baseUrls.length > 0
    ? "absolute"
    : "same-origin";
}

function readEnvApiSettings(): StreamifyBackendApiSettings {
  const baseUrls = parseEnvBaseUrlList(
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
    baseUrls
  );

  return {
    mode,
    baseUrl: mode === "absolute" ? baseUrls[0] || null : null,
    baseUrls: mode === "absolute" ? baseUrls : [],
    allowedOrigins: [],
    absoluteRoutes: parseEnvRouteList(
      process.env.NEXT_PUBLIC_STREAMIFY_API_ROUTES ||
        process.env.STREAMIFY_API_ROUTES ||
        process.env.NEXT_PUBLIC_API_ROUTES ||
        process.env.API_ROUTES
    ),
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
  return readEnvApiSettings();
}

export async function getBackendApiSettings(options?: {
  revalidate?: boolean;
}): Promise<StreamifyBackendApiSettings> {
  void options;
  return getCachedBackendApiSettings();
}

export function buildBackendRouteUrlCandidates(
  path: string,
  options?: {
    searchParams?: URLSearchParams | Record<string, QueryValue>;
    settings?: StreamifyBackendApiSettings;
  }
): string[] {
  const settings = options?.settings || getCachedBackendApiSettings();
  const normalizedPath = normalizeBackendRoutePath(path);
  const useAbsoluteRoute =
    settings.mode === "absolute" &&
    settings.baseUrls.length > 0 &&
    (settings.absoluteRoutes.length === 0 ||
      settings.absoluteRoutes.includes(normalizedPath));
  const baseValues = useAbsoluteRoute
    ? settings.baseUrls.map((baseUrl) =>
        joinBaseWithPath(baseUrl, normalizedPath)
      )
    : [`/api${normalizedPath === "/" ? "" : normalizedPath}`];

  return dedupeStrings(
    baseValues.map((value) => appendSearchParams(value, options?.searchParams))
  );
}

export function buildBackendRouteUrl(
  path: string,
  options?: {
    searchParams?: URLSearchParams | Record<string, QueryValue>;
    settings?: StreamifyBackendApiSettings;
  }
): string {
  return buildBackendRouteUrlCandidates(path, options)[0] || "/";
}

export async function buildBackendRouteUrlCandidatesAsync(
  path: string,
  options?: {
    searchParams?: URLSearchParams | Record<string, QueryValue>;
    settings?: StreamifyBackendApiSettings;
    revalidate?: boolean;
  }
): Promise<string[]> {
  const settings =
    options?.settings ||
    (await getBackendApiSettings({ revalidate: options?.revalidate }));
  return buildBackendRouteUrlCandidates(path, {
    searchParams: options?.searchParams,
    settings,
  });
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

function shouldRetryBackendResponse(response: Response): boolean {
  return (
    response.status >= 500 ||
    response.status === 403 ||
    response.status === 404 ||
    response.status === 429
  );
}

function canRetryBackendRequest(init?: RequestInit): boolean {
  const body = init?.body;
  if (body == null) return true;
  if (typeof body === "string") return true;
  if (
    typeof URLSearchParams !== "undefined" &&
    body instanceof URLSearchParams
  ) {
    return true;
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) return true;
  if (typeof Blob !== "undefined" && body instanceof Blob) return true;
  if (body instanceof ArrayBuffer) return true;
  if (ArrayBuffer.isView(body)) return true;
  return false;
}

export async function fetchBackendRoute(
  path: string,
  options?: {
    searchParams?: URLSearchParams | Record<string, QueryValue>;
    settings?: StreamifyBackendApiSettings;
    revalidate?: boolean;
    init?: RequestInit;
  }
): Promise<Response> {
  const candidates = await buildBackendRouteUrlCandidatesAsync(path, options);
  const requestInit = options?.init;
  const retryEnabled = canRetryBackendRequest(requestInit);
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      const response = await fetch(candidate, requestInit);
      const hasNextCandidate = retryEnabled && index < candidates.length - 1;

      if (
        !response.ok &&
        hasNextCandidate &&
        shouldRetryBackendResponse(response)
      ) {
        console.warn(
          `[backend-api] ${response.status} from ${candidate}; trying fallback backend`
        );
        lastResponse = response;
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      const hasNextCandidate = retryEnabled && index < candidates.length - 1;
      if (!hasNextCandidate) {
        throw error;
      }
      console.warn(
        `[backend-api] Request to ${candidate} failed; trying fallback backend`,
        error
      );
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError instanceof Error
    ? lastError
    : new Error(`No backend candidates succeeded for ${path}`);
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
