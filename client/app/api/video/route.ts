import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const PIPED_INSTANCES = ["https://api.piped.private.coffee"];
const INVIDIOUS_INSTANCES = [
  "https://yt.omada.cafe",
  "https://lekker.gay",
  "https://yt.chocolatemoo53.com",
  "https://inv.nadeko.net",
  "https://invidious.tiekoetter.com",
];

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const cache = new Map<string, { at: number; value: Record<string, unknown> }>();
const inflightRequests = new Map<string, Promise<Record<string, unknown>>>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const STALE_CACHE_TTL_MS = 60 * 60 * 1000;
const INVIDIOUS_TIMEOUT_MS = 10000;
const PIPED_TIMEOUT_MS = 7000;
const DEBUG_SERVER_URL = "http://127.0.0.1:7777/event";
const DEBUG_SESSION_ID = "playback-api";
const execFileAsync = promisify(execFile);

function reportDebugEvent(
  runId: string,
  hypothesisId: string,
  location: string,
  msg: string,
  data: Record<string, unknown>
) {
  fetch(DEBUG_SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      runId,
      hypothesisId,
      location,
      msg,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  if (signal) {
    if (signal.aborted) controller.abort();
    else
      signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
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

function absolutizeUrl(url: string, base: string): string {
  if (!url) return url;
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${base}${url}`;
  return url;
}

function isAudioMime(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.includes("audio/");
}

function toRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function toArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseJsonText(
  text: string,
  errorMessage = "Invalid JSON response"
): unknown {
  const normalized = text.replace(/^\uFEFF/, "").trim();
  if (!normalized) return null;

  try {
    return JSON.parse(normalized);
  } catch {
    const firstObject = normalized.indexOf("{");
    const firstArray = normalized.indexOf("[");
    const startCandidates = [firstObject, firstArray].filter(
      (value) => value >= 0
    );
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

async function fetchJsonViaPowerShell(
  url: string,
  timeoutMs: number
): Promise<unknown> {
  const escapedUrl = url.replace(/'/g, "''");
  const escapedUserAgent = USER_AGENT.replace(/'/g, "''");
  const script = [
    "$ProgressPreference = 'SilentlyContinue'",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    `$headers = @{ 'User-Agent' = '${escapedUserAgent}'; 'Accept' = 'application/json, text/plain;q=0.9, */*;q=0.8'; 'Accept-Language' = 'en-US,en;q=0.9'; 'Cache-Control' = 'no-cache'; 'Pragma' = 'no-cache' }`,
    `$response = Invoke-RestMethod -Uri '${escapedUrl}' -Headers $headers -TimeoutSec ${Math.max(
      1,
      Math.ceil(timeoutMs / 1000)
    )}`,
    "$response | ConvertTo-Json -Depth 100 -Compress",
  ].join("; ");

  const { stdout } = await execFileAsync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      timeout: timeoutMs + 3000,
      maxBuffer: 1024 * 1024 * 5,
    }
  );

  return parseJsonText(
    stdout,
    "Invalid JSON response from PowerShell fallback"
  );
}

async function fetchJson(
  url: string,
  signal?: AbortSignal,
  timeoutMs = INVIDIOUS_TIMEOUT_MS
): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      cache: "no-store",
      signal: withTimeout(signal, timeoutMs),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status}${text ? `: ${text.slice(0, 160)}` : ""}`
      );
    }

    return parseJsonText(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldTryPowerShell =
      process.platform === "win32" &&
      (/fetch failed|ECONNRESET|aborted|UND_ERR_CONNECT_TIMEOUT/i.test(
        message
      ) ||
        message.includes("This operation was aborted"));

    if (!shouldTryPowerShell) {
      throw error;
    }

    return fetchJsonViaPowerShell(url, timeoutMs);
  }
}

function pickBestStreamUrl(
  candidates: unknown[],
  base?: string
): string | null {
  const items = Array.isArray(candidates) ? candidates : [];

  const audioCandidates = items
    .filter((f: any) => typeof f?.url === "string")
    .filter((f: any) => {
      const t = typeof f?.type === "string" ? f.type : "";
      const mime = typeof f?.mimeType === "string" ? f.mimeType : "";
      return (
        isAudioMime(t) || isAudioMime(mime) || Boolean((f as any)?.audioCodec)
      );
    })
    .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

  const preferred =
    audioCandidates.find((f: any) =>
      String(f.type || f.mimeType || "").includes("mp4")
    ) ||
    audioCandidates.find((f: any) =>
      String(f.type || f.mimeType || "").includes("opus")
    ) ||
    audioCandidates[0];

  const p = preferred as any;
  const raw = p?.url ? String(p.url) : "";
  if (!raw) return null;
  return base ? absolutizeUrl(raw, base) : raw;
}

function buildInvidiousRelayUrl(
  streamUrl: string,
  base: string
): string | null {
  try {
    const resolvedStreamUrl = new URL(streamUrl, base);
    const providerBaseUrl = new URL(base);

    if (!/googlevideo\.com$/i.test(resolvedStreamUrl.hostname)) {
      return null;
    }

    providerBaseUrl.pathname = resolvedStreamUrl.pathname;
    providerBaseUrl.search = resolvedStreamUrl.search;
    providerBaseUrl.hash = "";

    return providerBaseUrl.toString();
  } catch {
    return null;
  }
}

function buildPlayableAudioUrl(
  streamUrl: string | null,
  base: string
): string | null {
  if (!streamUrl) return null;

  const resolvedStreamUrl = absolutizeUrl(streamUrl, base);
  const invidiousRelayUrl = buildInvidiousRelayUrl(resolvedStreamUrl, base);

  if (invidiousRelayUrl) {
    return invidiousRelayUrl;
  }

  return `/api/audio-proxy?url=${encodeURIComponent(resolvedStreamUrl)}`;
}

function summarizeAudioCandidates(
  candidates: unknown[]
): Record<string, unknown>[] {
  const items = Array.isArray(candidates) ? candidates : [];

  return items
    .filter((entry: any) => typeof entry?.url === "string")
    .slice(0, 5)
    .map((entry: any) => ({
      url: String(entry.url),
      type: typeof entry.type === "string" ? entry.type : null,
      mimeType: typeof entry.mimeType === "string" ? entry.mimeType : null,
      bitrate:
        typeof entry.bitrate === "number" || typeof entry.bitrate === "string"
          ? entry.bitrate
          : null,
      audioCodec:
        typeof entry.audioCodec === "string" ? entry.audioCodec : null,
    }));
}

function normalizeVideoPayload(
  data: unknown,
  base: string
): Record<string, unknown> | null {
  const record = toRecord(data);
  const adaptiveFormats = toArray(record.adaptiveFormats);
  const audioStreams = toArray(record.audioStreams);
  const formatStreams = toArray(record.formatStreams);
  const directAudioUrl =
    typeof record.audioUrl === "string" ? record.audioUrl : null;

  const preferredUrl =
    directAudioUrl ||
    pickBestStreamUrl([...adaptiveFormats, ...audioStreams], base) ||
    pickBestStreamUrl(formatStreams, base);

  const thumbs = toArray(record.videoThumbnails).map((entry) =>
    toRecord(entry)
  );
  const maxThumb = thumbs.find((t) => t.quality === "maxres")?.url;
  const anyThumb =
    typeof record.thumbnailUrl === "string"
      ? record.thumbnailUrl
      : typeof record.thumbnail === "string"
      ? record.thumbnail
      : thumbs[0]?.url;

  const audioUrl = buildPlayableAudioUrl(preferredUrl, base);

  if (
    !audioUrl &&
    !record.title &&
    !record.name &&
    !record.videoId &&
    !record.id
  ) {
    return null;
  }

  return {
    id: record.videoId || record.id,
    title: record.title || record.name,
    author: record.author || record.uploader || record.uploaderName,
    lengthSeconds:
      toNumber(record.lengthSeconds) ??
      toNumber(record.duration) ??
      toNumber(record.durationSeconds),
    adaptiveFormats:
      adaptiveFormats.length > 0
        ? adaptiveFormats
        : audioStreams.length > 0
        ? audioStreams
        : undefined,
    audioUrl,
    thumbnailUrl: absolutizeUrl(String(maxThumb || anyThumb || ""), base),
  };
}

async function fetchVideoFromInvidious(
  instance: string,
  videoId: string,
  signal?: AbortSignal
) {
  const base = instance.replace(/\/+$/, "");
  const data = await fetchJson(
    `${base}/api/v1/videos/${videoId}`,
    signal,
    INVIDIOUS_TIMEOUT_MS
  );
  const normalized = normalizeVideoPayload(data, base);
  if (!normalized?.audioUrl) {
    throw new Error(
      "Invidious response did not include a playable audio stream"
    );
  }
  return normalized;
}

async function fetchVideoFromPiped(
  instance: string,
  videoId: string,
  signal?: AbortSignal
) {
  const base = instance.replace(/\/+$/, "");
  const data = await fetchJson(
    `${base}/streams/${videoId}`,
    signal,
    PIPED_TIMEOUT_MS
  );
  const normalized = normalizeVideoPayload(data, base);
  if (!normalized?.audioUrl) {
    throw new Error("Piped response did not include a playable audio stream");
  }
  return normalized;
}

async function fetchVideoDetails(
  videoId: string,
  runId: string
): Promise<Record<string, unknown>> {
  const providers = [
    ...INVIDIOUS_INSTANCES.map((instance) => ({
      label: `invidious:${instance}`,
      run: (signal?: AbortSignal) =>
        fetchVideoFromInvidious(instance, videoId, signal),
    })),
    ...PIPED_INSTANCES.map((instance) => ({
      label: `piped:${instance}`,
      run: (signal?: AbortSignal) =>
        fetchVideoFromPiped(instance, videoId, signal),
    })),
  ];

  const errors: string[] = [];

  for (const provider of providers) {
    try {
      // #region debug-point D:provider-attempt
      reportDebugEvent(
        runId,
        "D",
        "app/api/video/route.ts:GET:provider-attempt",
        "[DEBUG] trying video provider",
        {
          videoId,
          provider: provider.label,
        }
      );
      // #endregion
      const controller = new AbortController();
      const value = (await provider.run(controller.signal)) as Record<
        string,
        unknown
      >;
      // #region debug-point H1:provider-payload-shape
      reportDebugEvent(
        runId,
        "H1",
        "app/api/video/route.ts:GET:provider-payload-shape",
        "[DEBUG] provider returned stream candidates",
        {
          videoId,
          provider: provider.label,
          audioUrl: value.audioUrl,
          adaptiveFormatsSample: summarizeAudioCandidates(
            toArray(value.adaptiveFormats)
          ),
        }
      );
      // #endregion
      // #region debug-point B:provider-success
      reportDebugEvent(
        runId,
        "B",
        "app/api/video/route.ts:GET:provider-success",
        "[DEBUG] video provider succeeded",
        {
          videoId,
          provider: provider.label,
          hasAudioUrl: Boolean(value.audioUrl),
          hasThumbnailUrl: Boolean(value.thumbnailUrl),
          title: value.title,
        }
      );
      // #endregion
      cache.set(videoId, { at: Date.now(), value });
      return value;
    } catch (error) {
      // #region debug-point C:provider-failure
      reportDebugEvent(
        runId,
        "C",
        "app/api/video/route.ts:GET:provider-failure",
        "[DEBUG] video provider failed",
        {
          videoId,
          provider: provider.label,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      // #endregion
      errors.push(
        `${provider.label}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // #region debug-point E:video-route-all-failed
  reportDebugEvent(
    runId,
    "E",
    "app/api/video/route.ts:GET:all-failed",
    "[DEBUG] all video providers failed",
    {
      videoId,
      errors,
    }
  );
  // #endregion
  throw new Error(errors.join(" | ") || "Failed to fetch video details");
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("id");
  const runId = `pre-${Date.now()}`;

  // #region debug-point A:video-route-entry
  reportDebugEvent(
    runId,
    "A",
    "app/api/video/route.ts:GET:entry",
    "[DEBUG] /api/video request received",
    {
      url: request.url,
      videoId,
    }
  );
  // #endregion

  if (!videoId) {
    // #region debug-point A:video-route-missing-id
    reportDebugEvent(
      runId,
      "A",
      "app/api/video/route.ts:GET:missing-id",
      "[DEBUG] /api/video missing id",
      {
        url: request.url,
      }
    );
    // #endregion
    return NextResponse.json(
      { error: "Video ID is required" },
      { status: 400 }
    );
  }

  const cached = cache.get(videoId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    // #region debug-point A:video-route-cache-hit
    reportDebugEvent(
      runId,
      "A",
      "app/api/video/route.ts:GET:cache-hit",
      "[DEBUG] /api/video cache hit",
      {
        videoId,
        ageMs: Date.now() - cached.at,
      }
    );
    // #endregion
    return NextResponse.json(cached.value);
  }

  try {
    let requestPromise = inflightRequests.get(videoId);
    if (!requestPromise) {
      requestPromise = fetchVideoDetails(videoId, runId).finally(() => {
        inflightRequests.delete(videoId);
      });
      inflightRequests.set(videoId, requestPromise);
    }

    const value = await requestPromise;
    return NextResponse.json(value);
  } catch (error) {
    if (cached && Date.now() - cached.at < STALE_CACHE_TTL_MS) {
      reportDebugEvent(
        runId,
        "E",
        "app/api/video/route.ts:GET:stale-cache-fallback",
        "[DEBUG] /api/video serving stale cache after provider failure",
        {
          videoId,
          ageMs: Date.now() - cached.at,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return NextResponse.json(cached.value);
    }

    // #region debug-point E:video-route-unhandled
    reportDebugEvent(
      runId,
      "E",
      "app/api/video/route.ts:GET:unhandled",
      "[DEBUG] /api/video unhandled error",
      {
        videoId,
        error: error instanceof Error ? error.message : String(error),
      }
    );
    // #endregion
    console.error("Failed to fetch video details:", error);
  }

  return NextResponse.json(
    { error: "Failed to fetch video details" },
    { status: 500 }
  );
}
