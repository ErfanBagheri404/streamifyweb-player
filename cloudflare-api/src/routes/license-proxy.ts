import type { WorkerConfig } from "../config";
import { createOptionsResponse, json } from "../http";

const LICENSE_PROXY_TIMEOUT_MS = 15000;

function matchesAllowedHost(hostname: string, allowedHost: string): boolean {
  const lowerHostname = hostname.toLowerCase();
  const lowerAllowedHost = allowedHost.toLowerCase();
  return (
    lowerHostname === lowerAllowedHost ||
    lowerHostname.endsWith(`.${lowerAllowedHost}`)
  );
}

function isAllowedLicenseUrl(value: string, config: WorkerConfig): boolean {
  try {
    const parsed = new URL(value);
    return config.api.proxy.allowedLicenseHosts.some((host) =>
      matchesAllowedHost(parsed.hostname, host)
    );
  } catch {
    return false;
  }
}

export async function handleLicenseProxy(
  request: Request,
  config: WorkerConfig
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return createOptionsResponse(request, config, {
      methods: ["GET", "POST", "OPTIONS"],
      headers: ["Content-Type", "Origin", "Referer", "Authorization"],
    });
  }

  const url = new URL(request.url);
  const licenseUrl = url.searchParams.get("url");

  if (!licenseUrl) {
    return json(
      {
        ok: true,
        message: "License proxy is reachable",
        expects: "POST ?url=<soundcloud-widevine-license-url> with binary body",
        allowedHosts: config.api.proxy.allowedLicenseHosts,
      },
      { status: 200 }
    );
  }

  if (!isAllowedLicenseUrl(licenseUrl, config)) {
    return json({ error: "Disallowed license URL host" }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LICENSE_PROXY_TIMEOUT_MS);

  try {
    if (request.method === "GET" || request.method === "HEAD") {
      const upstream = await fetch(licenseUrl, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
      });

      return json(
        {
          ok: upstream.ok,
          status: upstream.status,
          contentType: upstream.headers.get("content-type"),
          contentLength: upstream.headers.get("content-length"),
          accessControlAllowOrigin: upstream.headers.get(
            "access-control-allow-origin"
          ),
        },
        { status: upstream.ok ? 200 : upstream.status }
      );
    }

    const body = await request.arrayBuffer();
    if (!body || body.byteLength === 0 || body.byteLength > 2 * 1024 * 1024) {
      return json(
        { error: "Empty or oversized license request body" },
        { status: 400 }
      );
    }

    const headers = new Headers({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Content-Type":
        request.headers.get("content-type") || "application/octet-stream",
      Referer:
        config.headers.referers.soundcloud ||
        `${config.providers.soundcloud.origin}/`,
      Origin:
        config.headers.origins.soundcloud || config.providers.soundcloud.origin,
    });

    const authorization = request.headers.get("authorization");
    if (authorization) {
      headers.set("Authorization", authorization);
    }

    const upstream = await fetch(licenseUrl, {
      method: "POST",
      headers,
      body,
      redirect: "follow",
      signal: controller.signal,
    });

    const responseHeaders = new Headers({
      "Cache-Control": "no-store",
    });
    const contentType = upstream.headers.get("content-type");
    if (contentType) {
      responseHeaders.set("Content-Type", contentType);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return json(
      {
        error: "license proxy fetch failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
