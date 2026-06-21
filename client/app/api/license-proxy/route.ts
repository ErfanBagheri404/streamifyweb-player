import { NextRequest, NextResponse } from "next/server";
import { requireStreamifyRequest } from "../_lib/request-guard";

const LICENSE_PROXY_TIMEOUT_MS = 15000;
const SOUNDCLOUD_LICENSE_HOSTS = [
  "license.media-streaming.soundcloud.cloud",
  "license.media-streaming.soundcloud.com",
  "media-streaming.soundcloud.cloud",
];

async function reportDebugEvent(
  _runId: string,
  _hypothesisId: string,
  _location: string,
  _msg: string,
  _data: Record<string, unknown>
) {}

function isSoundCloudLicenseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return SOUNDCLOUD_LICENSE_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

function summarizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      code:
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code)
          : null,
    };
  }
  return { message: String(error) };
}

async function readBodyToArrayBuffer(
  body: ReadableStream<Uint8Array> | null
): Promise<ArrayBuffer | null> {
  if (!body) return null;
  try {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    // 2 MB cap is more than enough for a Widevine license message
    const cap = 2 * 1024 * 1024;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > cap) {
        return null;
      }
      chunks.push(value);
    }
    const combined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return combined.buffer;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const blockedResponse = requireStreamifyRequest(request);
  if (blockedResponse) return blockedResponse;

  const { searchParams } = new URL(request.url);
  const licenseUrl = searchParams.get("url");
  const runId = `license-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  console.log(
    `[license-proxy] ${runId} POST received`,
    JSON.stringify({
      hasUrl: Boolean(licenseUrl),
      urlHost: licenseUrl ? safeHost(licenseUrl) : null,
      contentType: request.headers.get("content-type"),
      contentLength: request.headers.get("content-length"),
    })
  );
  // #region debug-point B:license-proxy-post-received
  await reportDebugEvent(
    "post-fix",
    "B",
    "app/api/license-proxy/route.ts:POST:received",
    "[DEBUG] license proxy POST received",
    {
      runId,
      hasUrl: Boolean(licenseUrl),
      urlHost: licenseUrl ? safeHost(licenseUrl) : null,
      contentType: request.headers.get("content-type"),
      contentLength: request.headers.get("content-length"),
    }
  );
  // #endregion

  if (!licenseUrl) {
    return new NextResponse("License URL is required", { status: 400 });
  }

  if (!isSoundCloudLicenseUrl(licenseUrl)) {
    console.warn(
      `[license-proxy] ${runId} rejected non-SoundCloud license URL`,
      licenseUrl
    );
    return new NextResponse("Disallowed license URL host", { status: 400 });
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(licenseUrl);
  } catch {
    return new NextResponse("Invalid license URL", { status: 400 });
  }

  const body = await readBodyToArrayBuffer(request.body);
  if (body === null) {
    return new NextResponse("Empty or oversized license request body", {
      status: 400,
    });
  }

  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type":
      request.headers.get("content-type") || "application/octet-stream",
    Referer: "https://soundcloud.com/",
    Origin: "https://soundcloud.com",
  };

  if (request.headers.has("authorization")) {
    headers["Authorization"] = request.headers.get("authorization") as string;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LICENSE_PROXY_TIMEOUT_MS);

  console.log(
    `[license-proxy] ${runId} forwarding`,
    JSON.stringify({
      method: "POST",
      url: upstreamUrl.toString(),
      headers: pickForwardedHeaders(headers),
      bodyBytes: body.byteLength,
    })
  );
  // #region debug-point B:license-proxy-forwarding
  await reportDebugEvent(
    "post-fix",
    "B",
    "app/api/license-proxy/route.ts:POST:forwarding",
    "[DEBUG] license proxy forwarding request",
    {
      runId,
      method: "POST",
      url: upstreamUrl.toString(),
      headers: pickForwardedHeaders(headers),
      bodyBytes: body.byteLength,
    }
  );
  // #endregion

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      signal: controller.signal,
      redirect: "follow",
    });

    const responseBuffer = await upstream.arrayBuffer();

    console.log(
      `[license-proxy] ${runId} response`,
      JSON.stringify({
        status: upstream.status,
        ok: upstream.ok,
        bodyBytes: responseBuffer.byteLength,
        headers: {
          "content-type": upstream.headers.get("content-type"),
          "content-length": upstream.headers.get("content-length"),
        },
      })
    );
    // #region debug-point B:license-proxy-response
    await reportDebugEvent(
      "post-fix",
      "B",
      "app/api/license-proxy/route.ts:POST:response",
      "[DEBUG] license proxy upstream response received",
      {
        runId,
        status: upstream.status,
        ok: upstream.ok,
        bodyBytes: responseBuffer.byteLength,
        headers: {
          "content-type": upstream.headers.get("content-type"),
          "content-length": upstream.headers.get("content-length"),
        },
      }
    );
    // #endregion

    const responseHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders.set("Content-Type", contentType);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Cache-Control", "no-store");

    return new NextResponse(responseBuffer, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(
      `[license-proxy] ${runId} fetch failed`,
      JSON.stringify(summarizeError(error))
    );
    // #region debug-point B:license-proxy-failed
    await reportDebugEvent(
      "post-fix",
      "B",
      "app/api/license-proxy/route.ts:POST:failed",
      "[DEBUG] license proxy fetch failed",
      {
        runId,
        licenseUrl,
        error: summarizeError(error),
      }
    );
    // #endregion
    return new NextResponse(
      JSON.stringify({
        error: "license proxy fetch failed",
        details: summarizeError(error),
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  const blockedResponse = requireStreamifyRequest(request);
  if (blockedResponse) return blockedResponse;

  // Diagnostic endpoint — call this from the browser console to verify the
  // proxy route is reachable, CORS works, and the upstream SoundCloud
  // license server is reachable from this Next.js server. No CDM involved.
  const { searchParams } = new URL(request.url);
  const licenseUrl = searchParams.get("url");
  const runId = `diag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!licenseUrl) {
    return NextResponse.json(
      {
        ok: true,
        message: "License proxy is reachable",
        expects: "POST ?url=<soundcloud-widevine-license-url> with binary body",
        allowedHosts: SOUNDCLOUD_LICENSE_HOSTS,
      },
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  console.log(
    `[license-proxy] ${runId} DIAG GET`,
    JSON.stringify({
      hasUrl: Boolean(licenseUrl),
      urlHost: safeHost(licenseUrl),
    })
  );

  if (!isSoundCloudLicenseUrl(licenseUrl)) {
    return NextResponse.json(
      { ok: false, error: "Disallowed license URL host" },
      { status: 400 }
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LICENSE_PROXY_TIMEOUT_MS);

  try {
    const upstream = await fetch(licenseUrl, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
      redirect: "follow",
    });
    console.log(
      `[license-proxy] ${runId} DIAG upstream`,
      JSON.stringify({
        status: upstream.status,
        ok: upstream.ok,
        headers: {
          "content-type": upstream.headers.get("content-type"),
          "content-length": upstream.headers.get("content-length"),
        },
      })
    );
    return NextResponse.json(
      {
        ok: upstream.ok,
        status: upstream.status,
        contentType: upstream.headers.get("content-type"),
        contentLength: upstream.headers.get("content-length"),
        accessControlAllowOrigin: upstream.headers.get(
          "access-control-allow-origin"
        ),
      },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "upstream unreachable from this Next.js server",
        details: summarizeError(error),
      },
      { status: 502, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Origin, Referer, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function safeHost(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function pickForwardedHeaders(headers: Record<string, string>) {
  return {
    "user-agent": headers["User-Agent"],
    "content-type": headers["Content-Type"],
    referer: headers["Referer"],
    origin: headers["Origin"],
    authorization: headers["Authorization"] ?? null,
  };
}
