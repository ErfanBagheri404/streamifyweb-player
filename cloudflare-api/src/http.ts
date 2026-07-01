import type { WorkerConfig } from "./config";

type CorsConfig = Pick<WorkerConfig, "api">;

export function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number
): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
  }

  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
    },
    { once: true }
  );

  return controller.signal;
}

export function json(
  payload: unknown,
  init?: ResponseInit & { headers?: HeadersInit }
): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  });
}

export function getAllowedOrigin(
  request: Request,
  config: CorsConfig
): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  if (config.api.allowedOrigins.length === 0) {
    return origin;
  }

  return config.api.allowedOrigins.includes(origin) ? origin : null;
}

export function applyCorsHeaders(
  response: Response,
  request: Request,
  config: CorsConfig,
  options?: {
    methods?: string[];
    headers?: string[];
    exposeHeaders?: string[];
  }
): Response {
  const headers = new Headers(response.headers);
  const allowedOrigin = getAllowedOrigin(request, config);
  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Vary", "Origin");
  }

  if (options?.methods?.length) {
    headers.set("Access-Control-Allow-Methods", options.methods.join(", "));
  }
  if (options?.headers?.length) {
    headers.set("Access-Control-Allow-Headers", options.headers.join(", "));
  }
  if (options?.exposeHeaders?.length) {
    headers.set("Access-Control-Expose-Headers", options.exposeHeaders.join(", "));
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createOptionsResponse(
  request: Request,
  config: CorsConfig,
  options: {
    methods: string[];
    headers: string[];
    exposeHeaders?: string[];
  }
): Response {
  return applyCorsHeaders(
    new Response(null, { status: 204 }),
    request,
    config,
    options
  );
}

export function buildWorkerUrl(
  request: Request,
  path: string,
  searchParams?: URLSearchParams | Record<string, string | number | boolean>
): string {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = "";
  if (searchParams instanceof URLSearchParams) {
    searchParams.forEach((value, key) => url.searchParams.append(key, value));
  } else if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export function absolutizeUrl(url: string, base: string): string {
  if (!url) return url;
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${base}${url}`;
  return url;
}

export function toRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export function toArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function parseJsonText(text: string, errorMessage = "Invalid JSON response"): unknown {
  const normalized = text.replace(/^\uFEFF/, "").trim();
  if (!normalized) return null;

  try {
    return JSON.parse(normalized);
  } catch {
    const firstObject = normalized.indexOf("{");
    const firstArray = normalized.indexOf("[");
    const startCandidates = [firstObject, firstArray].filter((value) => value >= 0);
    const lastObject = normalized.lastIndexOf("}");
    const lastArray = normalized.lastIndexOf("]");
    const end = Math.max(lastObject, lastArray);

    if (startCandidates.length > 0 && end >= 0) {
      const start = Math.min(...startCandidates);
      if (end > start) {
        return JSON.parse(normalized.slice(start, end + 1));
      }
    }
    throw new Error(errorMessage);
  }
}
