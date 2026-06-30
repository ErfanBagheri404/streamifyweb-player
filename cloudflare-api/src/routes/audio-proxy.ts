import type { WorkerConfig } from "../config";
import { buildWorkerUrl, createOptionsResponse, json } from "../http";

const AUDIO_REQUEST_TIMEOUT_MS = 20000;

function matchesAllowedHost(hostname: string, allowedHost: string): boolean {
  const lowerHostname = hostname.toLowerCase();
  const lowerAllowedHost = allowedHost.toLowerCase();
  return (
    lowerHostname === lowerAllowedHost ||
    lowerHostname.endsWith(`.${lowerAllowedHost}`)
  );
}

function isAllowedAudioHost(hostname: string, config: WorkerConfig): boolean {
  const configuredHosts = [
    ...config.instances.invidious,
    ...config.instances.piped,
  ]
    .map((value) => {
      try {
        return new URL(value).hostname.toLowerCase();
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  const allowedHosts = [
    ...config.api.proxy.allowedAudioHosts,
    ...configuredHosts,
  ];

  return allowedHosts.some((allowedHost) =>
    matchesAllowedHost(hostname, allowedHost)
  );
}

function isSoundCloudHost(hostname: string): boolean {
  return (
    hostname.includes("soundcloud.com") ||
    hostname.includes("sndcdn.com") ||
    hostname.includes("soundcloud.cloud")
  );
}

function isHlsPlaylistResponse(finalUrl: string, headers: Headers): boolean {
  const contentType = headers.get("content-type") || "";
  return (
    /mpegurl|vnd\.apple\.mpegurl/i.test(contentType) ||
    /\.m3u8(?:$|\?)/i.test(finalUrl)
  );
}

function buildProxyHeaders(
  request: Request,
  audioUrl: URL,
  config: WorkerConfig
): Headers {
  const headers = new Headers({
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "audio/mp4,audio/webm,audio/*;q=0.9,*/*;q=0.5",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "identity",
    DNT: "1",
    "Cache-Control": "no-cache",
  });

  const range = request.headers.get("range");
  if (range) {
    headers.set("Range", range);
  }

  if (audioUrl.hostname.includes("saavncdn.com")) {
    headers.set("Referer", config.headers.referers.jiosaavn);
    headers.set("Origin", config.headers.origins.jiosaavn);
  } else if (isSoundCloudHost(audioUrl.hostname)) {
    headers.set("Referer", config.headers.referers.soundcloud);
    headers.set("Origin", config.headers.origins.soundcloud);
    headers.set(
      "Accept",
      "application/vnd.apple.mpegurl,application/x-mpegURL,audio/mp4,audio/*;q=0.9,*/*;q=0.5"
    );
  } else {
    headers.set("Referer", config.headers.referers.youtube);
    headers.set("Origin", config.headers.origins.youtube);
    headers.set("Sec-Fetch-Dest", "audio");
    headers.set("Sec-Fetch-Mode", "cors");
    headers.set("Sec-Fetch-Site", "cross-site");
  }

  return headers;
}

function buildResponseHeaders(upstream: Response): Headers {
  const headers = new Headers({
    "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
    "Cache-Control": "public, max-age=3600",
    "Content-Type": upstream.headers.get("content-type") || "audio/mp4",
  });

  const contentLength = upstream.headers.get("content-length");
  const contentRange = upstream.headers.get("content-range");

  if (contentLength) headers.set("Content-Length", contentLength);
  if (contentRange) headers.set("Content-Range", contentRange);

  return headers;
}

function rewriteHlsAttributeUris(
  line: string,
  playlistUrl: string,
  request: Request
): string {
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
        ? buildWorkerUrl(request, "/license-proxy", { url: absoluteUrl })
        : buildWorkerUrl(request, "/audio-proxy", { url: absoluteUrl });
      return `URI="${proxied}"`;
    }
  );
}

function rewriteHlsPlaylist(
  playlistText: string,
  playlistUrl: string,
  request: Request
): string {
  return playlistText
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return rewriteHlsAttributeUris(line, playlistUrl, request);
      }
      if (/^data:/i.test(trimmed)) return line;
      return buildWorkerUrl(request, "/audio-proxy", {
        url: new URL(trimmed, playlistUrl).toString(),
      });
    })
    .join("\n");
}

export async function handleAudioProxy(
  request: Request,
  config: WorkerConfig
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return createOptionsResponse(request, config, {
      methods: ["GET", "HEAD", "OPTIONS"],
      headers: ["Range", "Content-Type", "Origin", "Referer"],
      exposeHeaders: [
        "Content-Length",
        "Content-Range",
        "Content-Type",
        "Accept-Ranges",
      ],
    });
  }

  const url = new URL(request.url);
  const audioUrl = url.searchParams.get("url");
  if (!audioUrl) {
    return json({ error: "Audio URL is required" }, { status: 400 });
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(audioUrl);
  } catch {
    return json({ error: "Invalid audio URL" }, { status: 400 });
  }

  if (!isAllowedAudioHost(upstreamUrl.hostname, config)) {
    return json({ error: "Disallowed audio host" }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUDIO_REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: buildProxyHeaders(request, upstreamUrl, config),
      redirect: "follow",
      signal: controller.signal,
    });

    if (!upstream.ok) {
      return new Response(`Failed to fetch audio stream: ${upstream.status}`, {
        status: upstream.status,
      });
    }

    const responseHeaders = buildResponseHeaders(upstream);
    const finalUrl = upstream.url || upstreamUrl.toString();
    const treatAsHlsPlaylist =
      isHlsPlaylistResponse(finalUrl, upstream.headers) ||
      /\.m3u8(?:$|\?)/i.test(upstreamUrl.toString());

    if (treatAsHlsPlaylist) {
      const playlistText = await upstream.text();
      const rewrittenPlaylist = rewriteHlsPlaylist(
        playlistText,
        finalUrl,
        request
      );
      responseHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
      responseHeaders.set("Cache-Control", "no-store, max-age=0");
      responseHeaders.set("Pragma", "no-cache");
      responseHeaders.delete("Content-Length");
      return new Response(rewrittenPlaylist, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return json(
      {
        error: "Failed to proxy audio stream",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
