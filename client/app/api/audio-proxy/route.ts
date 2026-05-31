import type { IncomingHttpHeaders } from "node:http";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";

const DEBUG_SERVER_URL = "";
const DEBUG_SESSION_ID = "playback-source-500";
const AUDIO_REQUEST_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 5;
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EHOSTUNREACH",
]);
const DEFAULT_MAX_RETRIES = 1;
const JIOSAAVN_MAX_RETRIES = 3;

function reportDebugEvent(
  runId: string,
  hypothesisId: string,
  location: string,
  msg: string,
  data: Record<string, unknown>
) {
  if (!DEBUG_SERVER_URL) return;

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

interface ProxiedAudioResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: Readable;
  finalUrl: string;
  redirectChain: string[];
}

function isRedirectStatus(statusCode: number): boolean {
  return statusCode >= 300 && statusCode < 400;
}

function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  return RETRYABLE_ERROR_CODES.has(code);
}

function readHeader(
  headers: IncomingHttpHeaders,
  name: keyof IncomingHttpHeaders
): string | null {
  const value = headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

async function requestAudioStream(
  audioUrl: string,
  headers: Record<string, string>,
  redirectCount = 0,
  retryCount = 0,
  redirectChain: string[] = []
): Promise<ProxiedAudioResponse> {
  const url = new URL(audioUrl);
  const transport = url.protocol === "https:" ? https : http;
  const maxRetries = url.hostname.includes("saavncdn.com")
    ? JIOSAAVN_MAX_RETRIES
    : DEFAULT_MAX_RETRIES;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: "GET",
        headers,
        ...(url.hostname.includes("saavncdn.com") ? { family: 4 } : {}),
      },
      (response) => {
        const statusCode = response.statusCode ?? 502;

        if (isRedirectStatus(statusCode)) {
          const location = response.headers.location;
          response.resume();

          if (!location) {
            reject(new Error("Audio proxy received redirect without location"));
            return;
          }

          if (redirectCount >= MAX_REDIRECTS) {
            reject(new Error("Audio proxy exceeded redirect limit"));
            return;
          }

          const redirectUrl = new URL(location, audioUrl).toString();
          resolve(
            requestAudioStream(
              redirectUrl,
              headers,
              redirectCount + 1,
              retryCount,
              [...redirectChain, redirectUrl]
            )
          );
          return;
        }

        resolve({
          statusCode,
          headers: response.headers,
          body: response,
          finalUrl: audioUrl,
          redirectChain,
        });
      }
    );

    req.setTimeout(AUDIO_REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error("Audio proxy request timed out"));
    });

    req.on("error", (error) => {
      if (retryCount < maxRetries && isRetryableError(error)) {
        const delayMs = 250 * (retryCount + 1);
        setTimeout(() => {
          resolve(
            requestAudioStream(
              audioUrl,
              headers,
              redirectCount,
              retryCount + 1,
              redirectChain
            )
          );
        }, delayMs);
        return;
      }

      reject(error);
    });

    req.end();
  });
}

function buildProxyResponseHeaders(headers: IncomingHttpHeaders): Headers {
  const responseHeaders = new Headers({
    "Accept-Ranges": readHeader(headers, "accept-ranges") || "bytes",
    "Cache-Control": "public, max-age=3600",
    "Content-Type": readHeader(headers, "content-type") || "audio/mp4",
  });

  const contentLength = readHeader(headers, "content-length");
  const contentRange = readHeader(headers, "content-range");

  if (contentLength) responseHeaders.set("Content-Length", contentLength);
  if (contentRange) responseHeaders.set("Content-Range", contentRange);

  return responseHeaders;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const audioUrl = searchParams.get("url");
  const runId = `pre-audio-${Date.now()}`;

  // #region debug-point H4:audio-proxy-entry
  reportDebugEvent(
    runId,
    "H4",
    "app/api/audio-proxy/route.ts:GET:entry",
    "[DEBUG] /api/audio-proxy request received",
    {
      hasAudioUrl: Boolean(audioUrl),
      audioHost: audioUrl ? new URL(audioUrl).host : null,
      hasRange: Boolean(request.headers.get("range")),
    }
  );
  // #endregion

  if (!audioUrl) {
    // #region debug-point H4:audio-proxy-missing-url
    reportDebugEvent(
      runId,
      "H4",
      "app/api/audio-proxy/route.ts:GET:missing-url",
      "[DEBUG] /api/audio-proxy missing url",
      {}
    );
    // #endregion
    return new NextResponse("Audio URL is required", { status: 400 });
  }

  try {
    const range = request.headers.get("range");

    // Create headers that mimic a real browser request
    const headers: Record<string, string> = {
      // Essential headers to avoid 403 errors
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "audio/mp4,audio/webm,audio/*;q=0.9,*/*;q=0.5",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "identity",
      DNT: "1",
      "Cache-Control": "no-cache",
    };

    // Set appropriate referer and origin based on the audio URL domain
    try {
      const audioUrlObj = new URL(audioUrl);
      if (audioUrlObj.hostname.includes("saavncdn.com")) {
        // JioSaavn specific headers
        headers.Referer = "https://www.jiosaavn.com/";
        headers.Origin = "https://www.jiosaavn.com";
      } else if (
        audioUrlObj.hostname.includes("soundcloud.com") ||
        audioUrlObj.hostname.includes("sndcdn.com")
      ) {
        // SoundCloud specific headers
        headers.Referer = "https://soundcloud.com/";
        headers.Origin = "https://soundcloud.com";
      } else {
        // Default YouTube headers
        headers.Referer = "https://www.youtube.com/";
        headers.Origin = "https://www.youtube.com";
        headers["Sec-Fetch-Dest"] = "audio";
        headers["Sec-Fetch-Mode"] = "cors";
        headers["Sec-Fetch-Site"] = "cross-site";
      }
    } catch {
      // Fallback to YouTube headers if URL parsing fails
      headers.Referer = "https://www.youtube.com/";
      headers.Origin = "https://www.youtube.com";
      headers["Sec-Fetch-Dest"] = "audio";
      headers["Sec-Fetch-Mode"] = "cors";
      headers["Sec-Fetch-Site"] = "cross-site";
    }

    if (range) headers.Range = range;

    // #region debug-point H4:audio-proxy-fetch-start
    reportDebugEvent(
      runId,
      "H4",
      "app/api/audio-proxy/route.ts:GET:fetch-start",
      "[DEBUG] audio proxy fetch start",
      {
        audioHost: new URL(audioUrl).host,
        hasRange: Boolean(range),
        upstreamPath: `${new URL(audioUrl).host}${new URL(audioUrl).pathname}`,
      }
    );
    // #endregion
    const response = await requestAudioStream(audioUrl, headers);

    if (new URL(response.finalUrl).host !== new URL(audioUrl).host) {
      // #region debug-point H4:audio-proxy-redirect
      reportDebugEvent(
        runId,
        "H4",
        "app/api/audio-proxy/route.ts:GET:redirect",
        "[DEBUG] audio proxy redirect followed",
        {
          fromHost: new URL(audioUrl).host,
          toHost: new URL(response.finalUrl).host,
          status: response.statusCode,
          redirectChain: response.redirectChain,
        }
      );
      // #endregion
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      // #region debug-point H4:audio-proxy-fetch-failure
      reportDebugEvent(
        runId,
        "H4",
        "app/api/audio-proxy/route.ts:GET:fetch-failure",
        "[DEBUG] audio proxy fetch failed",
        {
          status: response.statusCode,
          audioHost: new URL(response.finalUrl).host,
          finalUrl: response.finalUrl,
          redirectChain: response.redirectChain,
        }
      );
      // #endregion
      console.error(`Audio proxy failed with status: ${response.statusCode}`);
      return new NextResponse(
        `Failed to fetch audio stream: ${response.statusCode}`,
        { status: response.statusCode }
      );
    }

    const responseHeaders = buildProxyResponseHeaders(response.headers);

    // #region debug-point H4:audio-proxy-success
    reportDebugEvent(
      runId,
      "H4",
      "app/api/audio-proxy/route.ts:GET:success",
      "[DEBUG] audio proxy fetch succeeded",
      {
        status: response.statusCode,
        contentType: readHeader(response.headers, "content-type"),
        audioHost: new URL(response.finalUrl).host,
        finalUrl: response.finalUrl,
        redirectChain: response.redirectChain,
        contentRange: readHeader(response.headers, "content-range"),
      }
    );
    // #endregion
    return new NextResponse(Readable.toWeb(response.body) as ReadableStream, {
      status: response.statusCode,
      headers: responseHeaders,
    });
  } catch (error) {
    // #region debug-point H4:audio-proxy-exception
    reportDebugEvent(
      runId,
      "H4",
      "app/api/audio-proxy/route.ts:GET:exception",
      "[DEBUG] audio proxy exception",
      {
        error: error instanceof Error ? error.message : String(error),
        audioHost: audioUrl ? new URL(audioUrl).host : null,
      }
    );
    // #endregion
    console.error("Audio proxy error:", error);
    return new NextResponse("Failed to proxy audio stream", { status: 502 });
  }
}
