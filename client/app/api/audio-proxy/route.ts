import fs from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";

const DEBUG_ENV_FILE = ".dbg/soundcloud-geekin-fail.env";
const DEBUG_SERVER_URL_FALLBACK = "";
const DEBUG_SESSION_ID_FALLBACK = "soundcloud-geekin-fail";
const debugConfig = (() => {
  let serverUrl = DEBUG_SERVER_URL_FALLBACK;
  let sessionId = DEBUG_SESSION_ID_FALLBACK;

  try {
    const envContents = fs.readFileSync(DEBUG_ENV_FILE, "utf8");
    const parsedUrl = envContents
      .match(/^DEBUG_SERVER_URL=(.+)$/m)?.[1]
      ?.trim();
    const parsedSessionId = envContents
      .match(/^DEBUG_SESSION_ID=(.+)$/m)?.[1]
      ?.trim();
    if (parsedUrl) serverUrl = parsedUrl;
    if (parsedSessionId) sessionId = parsedSessionId;
  } catch {}

  return { serverUrl, sessionId };
})();
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
const GOOGLEVIDEO_MAX_RETRIES = 3;
const JIOSAAVN_MAX_RETRIES = 3;

function reportDebugEvent(
  runId: string,
  hypothesisId: string,
  location: string,
  msg: string,
  data: Record<string, unknown>
) {
  if (!debugConfig.serverUrl) return;

  fetch(debugConfig.serverUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: debugConfig.sessionId,
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
  body: Readable | ReadableStream;
  finalUrl: string;
  redirectChain: string[];
}

function isRedirectStatus(statusCode: number): boolean {
  return statusCode >= 300 && statusCode < 400;
}

function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return (
    RETRYABLE_ERROR_CODES.has(code) ||
    /fetch failed|aborted|timeout/i.test(message)
  );
}

function readHeader(
  headers: IncomingHttpHeaders,
  name: keyof IncomingHttpHeaders
): string | null {
  const value = headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

function buildProxyAudioUrl(audioUrl: string): string {
  return `/api/audio-proxy?url=${encodeURIComponent(audioUrl)}`;
}

function buildLicenseProxyUrl(licenseUrl: string): string {
  return `/api/license-proxy?url=${encodeURIComponent(licenseUrl)}`;
}

function readInterestingHeaders(headers: IncomingHttpHeaders) {
  return {
    contentType: readHeader(headers, "content-type"),
    contentLength: readHeader(headers, "content-length"),
    contentRange: readHeader(headers, "content-range"),
    cacheControl: readHeader(headers, "cache-control"),
    acceptRanges: readHeader(headers, "accept-ranges"),
    location: readHeader(headers, "location"),
    server: readHeader(headers, "server"),
    via: readHeader(headers, "via"),
  };
}

function isGoogleVideoHost(hostname: string): boolean {
  return hostname.includes("googlevideo.com");
}

function isSoundCloudHost(hostname: string): boolean {
  return (
    hostname.includes("soundcloud.com") ||
    hostname.includes("sndcdn.com") ||
    hostname.includes("soundcloud.cloud")
  );
}

function headersToIncomingHttpHeaders(headers: Headers): IncomingHttpHeaders {
  const result: IncomingHttpHeaders = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

async function requestAudioStreamViaFetch(
  audioUrl: string,
  headers: Record<string, string>,
  retryCount = 0,
  redirectChain: string[] = []
): Promise<ProxiedAudioResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    AUDIO_REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(audioUrl, {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.body) {
      throw new Error("Audio proxy received empty upstream body");
    }

    const finalUrl = response.url || audioUrl;
    const nextRedirectChain =
      finalUrl !== audioUrl ? [...redirectChain, finalUrl] : redirectChain;

    return {
      statusCode: response.status,
      headers: headersToIncomingHttpHeaders(response.headers),
      body: response.body,
      finalUrl,
      redirectChain: nextRedirectChain,
    };
  } catch (error) {
    if (retryCount < GOOGLEVIDEO_MAX_RETRIES && isRetryableError(error)) {
      const delayMs = 250 * (retryCount + 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return requestAudioStreamViaFetch(
        audioUrl,
        headers,
        retryCount + 1,
        redirectChain
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestAudioStream(
  audioUrl: string,
  headers: Record<string, string>,
  redirectCount = 0,
  retryCount = 0,
  redirectChain: string[] = []
): Promise<ProxiedAudioResponse> {
  const url = new URL(audioUrl);
  if (isGoogleVideoHost(url.hostname)) {
    return requestAudioStreamViaFetch(
      audioUrl,
      headers,
      retryCount,
      redirectChain
    );
  }

  const transport = url.protocol === "https:" ? https : http;
  const shouldForceIpv4 = url.hostname.includes("saavncdn.com");
  const maxRetries = url.hostname.includes("saavncdn.com")
    ? JIOSAAVN_MAX_RETRIES
    : isGoogleVideoHost(url.hostname)
    ? GOOGLEVIDEO_MAX_RETRIES
    : DEFAULT_MAX_RETRIES;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: "GET",
        headers,
        ...(shouldForceIpv4 ? { family: 4 } : {}),
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
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type, Origin, Referer",
    "Access-Control-Expose-Headers":
      "Content-Length, Content-Range, Content-Type, Accept-Ranges",
  });

  const contentLength = readHeader(headers, "content-length");
  const contentRange = readHeader(headers, "content-range");

  if (contentLength) responseHeaders.set("Content-Length", contentLength);
  if (contentRange) responseHeaders.set("Content-Range", contentRange);

  return responseHeaders;
}

function summarizeAudioUrl(audioUrl: string) {
  try {
    const parsed = new URL(audioUrl);
    return {
      urlHost: parsed.host,
      urlPath: parsed.pathname,
      itag: parsed.searchParams.get("itag"),
      mime: parsed.searchParams.get("mime"),
      source: parsed.searchParams.get("source"),
      expire: parsed.searchParams.get("expire"),
      hasSignature: parsed.searchParams.has("sig"),
      hasPot: parsed.searchParams.has("pot"),
      queryLength: parsed.search.length,
    };
  } catch {
    return {
      urlHost: null,
      urlPath: null,
      itag: null,
      mime: null,
      source: null,
      expire: null,
      hasSignature: null,
      hasPot: null,
      queryLength: null,
    };
  }
}

function isHlsPlaylistResponse(
  finalUrl: string,
  headers: IncomingHttpHeaders
): boolean {
  const contentType = readHeader(headers, "content-type") || "";
  return (
    /mpegurl|vnd\.apple\.mpegurl/i.test(contentType) ||
    /\.m3u8(?:$|\?)/i.test(finalUrl)
  );
}

function rewriteHlsAttributeUris(line: string, playlistUrl: string): string {
  const isKeyLine = /^#EXT-X-KEY(?::[^,\s]+)?\b/i.test(line.trim());

  return line.replace(
    /URI=(?:"([^"]+)"|'([^']+)'|([^",\s]+))/g,
    (_match, doubleQuoted, singleQuoted, bare) => {
      const uri =
        typeof doubleQuoted === "string" && doubleQuoted
          ? doubleQuoted
          : typeof singleQuoted === "string" && singleQuoted
          ? singleQuoted
          : typeof bare === "string" && bare
          ? bare
          : "";

      if (!uri || /^data:/i.test(uri)) return `URI="${uri}"`;
      const absoluteUrl = new URL(uri, playlistUrl).toString();
      const proxied = isKeyLine
        ? buildLicenseProxyUrl(absoluteUrl)
        : buildProxyAudioUrl(absoluteUrl);
      return `URI="${proxied}"`;
    }
  );
}

function rewriteHlsPlaylist(playlistText: string, playlistUrl: string): string {
  return playlistText
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return rewriteHlsAttributeUris(line, playlistUrl);
      }
      if (/^data:/i.test(trimmed)) return line;
      return buildProxyAudioUrl(new URL(trimmed, playlistUrl).toString());
    })
    .join("\n");
}

async function readResponseBodyAsText(
  body: Readable | ReadableStream
): Promise<string> {
  const stream =
    body instanceof Readable ? (Readable.toWeb(body) as ReadableStream) : body;
  return new Response(stream).text();
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type, Origin, Referer",
      "Access-Control-Max-Age": "86400",
    },
  });
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
      urlSummary: audioUrl ? summarizeAudioUrl(audioUrl) : null,
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
      } else if (isSoundCloudHost(audioUrlObj.hostname)) {
        // SoundCloud specific headers
        headers.Referer = "https://soundcloud.com/";
        headers.Origin = "https://soundcloud.com";
        headers.Accept =
          "application/vnd.apple.mpegurl,application/x-mpegURL,audio/mp4,audio/*;q=0.9,*/*;q=0.5";
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
        configuredDebugSession: debugConfig.sessionId,
        range: range || null,
        urlSummary: summarizeAudioUrl(audioUrl),
        requestHeaders: {
          accept: headers.Accept || null,
          referer: headers.Referer || null,
          origin: headers.Origin || null,
          secFetchDest: headers["Sec-Fetch-Dest"] || null,
          secFetchMode: headers["Sec-Fetch-Mode"] || null,
          secFetchSite: headers["Sec-Fetch-Site"] || null,
          range: headers.Range || null,
        },
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
          finalUrlSummary: summarizeAudioUrl(response.finalUrl),
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
          finalUrlSummary: summarizeAudioUrl(response.finalUrl),
          redirectChain: response.redirectChain,
          headers: readInterestingHeaders(response.headers),
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

    const treatAsHlsPlaylist =
      isHlsPlaylistResponse(response.finalUrl, response.headers) ||
      /\.m3u8(?:$|\?)/i.test(audioUrl);

    if (treatAsHlsPlaylist) {
      const playlistText = await readResponseBodyAsText(response.body);
      const rewrittenPlaylist = rewriteHlsPlaylist(
        playlistText,
        response.finalUrl
      );
      responseHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
      responseHeaders.delete("Content-Length");
      // HLS playlists contain short-lived signed URLs (Policy/Signature
      // tokens with an `expires=` timestamp). Caching them for an hour
      // would mean Shaka keeps using an expired manifest and would keep
      // hitting a stale #EXT-X-KEY URI. Force a re-fetch every time.
      responseHeaders.set("Cache-Control", "no-store, max-age=0");
      responseHeaders.set("Pragma", "no-cache");

      // Surface the rewritten license URIs so we can see in the proxy
      // logs that #EXT-X-KEY is being routed through /api/license-proxy.
      const rewrittenKeyLines = rewrittenPlaylist
        .split(/\r?\n/)
        .filter((line) => /^#EXT-X-KEY/i.test(line.trim()));
      console.log(
        `[audio-proxy] ${runId} HLS rewrite`,
        JSON.stringify({
          audioHost: new URL(response.finalUrl).host,
          finalUrl: response.finalUrl,
          lineCount: playlistText.split(/\r?\n/).length,
          extXKeyLineCount: rewrittenKeyLines.length,
          extXKeySample: rewrittenKeyLines[0] || null,
        })
      );

      responseHeaders.set("X-Streamify-RunId", runId);
      responseHeaders.set("X-Streamify-HlsRewrite", "1");
      responseHeaders.set(
        "X-Streamify-HasExtXKey",
        String(rewrittenKeyLines.length)
      );

      reportDebugEvent(
        runId,
        "H4",
        "app/api/audio-proxy/route.ts:GET:hls-playlist-rewritten",
        "[DEBUG] audio proxy HLS playlist rewritten",
        {
          audioHost: new URL(response.finalUrl).host,
          finalUrl: response.finalUrl,
          redirectChain: response.redirectChain,
          lineCount: playlistText.split(/\r?\n/).length,
          extXKeyLineCount: rewrittenKeyLines.length,
          extXKeySample: rewrittenKeyLines[0] || null,
        }
      );

      return new NextResponse(rewrittenPlaylist, {
        status: response.statusCode,
        headers: responseHeaders,
      });
    }

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
        finalUrlSummary: summarizeAudioUrl(response.finalUrl),
        redirectChain: response.redirectChain,
        contentRange: readHeader(response.headers, "content-range"),
        contentLength: readHeader(response.headers, "content-length"),
      }
    );
    // #endregion
    return new NextResponse(
      response.body instanceof Readable
        ? (Readable.toWeb(response.body) as ReadableStream)
        : response.body,
      {
        status: response.statusCode,
        headers: responseHeaders,
      }
    );
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
        urlSummary: audioUrl ? summarizeAudioUrl(audioUrl) : null,
        errorCode:
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code)
            : null,
      }
    );
    // #endregion
    console.error("Audio proxy error:", error);
    return new NextResponse("Failed to proxy audio stream", { status: 502 });
  }
}
