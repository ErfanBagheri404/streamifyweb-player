import { NextRequest, NextResponse } from "next/server";
import { requireStreamifyRequest } from "../_lib/request-guard";
import { buildYouTubeThumbnailUrl } from "../../lib/youtube-thumbnails";

const WSRV_BASE = "https://wsrv.nl/";
const THUMBNAIL_TIMEOUT_MS = 8000;
const DEFAULT_VARIANT = "maxresdefault.jpg";
function normalizeVariantRoot(value: string): string {
  const rawRoot = value
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "");
  switch (rawRoot) {
    case "maxres":
    case "maxresdefault":
      return "maxresdefault";
    case "sd":
    case "sddefault":
      return "sddefault";
    case "hq":
    case "hqdefault":
      return "hqdefault";
    case "mq":
    case "mqdefault":
      return "mqdefault";
    case "default":
      return "default";
    default:
      return "hqdefault";
  }
}

function buildVariantFallbacks(
  requestedVariant: string,
  useWebp: boolean
): string[] {
  const extension = useWebp ? "webp" : "jpg";
  const requestedRoot = normalizeVariantRoot(
    requestedVariant || DEFAULT_VARIANT
  );
  const orderedRoots =
    requestedRoot === "maxresdefault"
      ? ["maxresdefault", "sddefault", "hqdefault", "mqdefault", "default"]
      : requestedRoot === "sddefault"
      ? ["sddefault", "hqdefault", "mqdefault", "default"]
      : requestedRoot === "hqdefault"
      ? ["hqdefault", "mqdefault", "default"]
      : requestedRoot === "mqdefault"
      ? ["mqdefault", "default"]
      : ["default"];

  return orderedRoots.map((root) => `${root}.${extension}`);
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseQuality(value: string | null): number | null {
  const parsed = parsePositiveInt(value);
  if (!parsed) return null;
  return Math.max(1, Math.min(100, parsed));
}

function buildWsrvUrl(
  url: string,
  options: {
    width: number | null;
    height: number | null;
    fit: string | null;
    alignment: string | null;
    trim: string | null;
    output: string | null;
    quality: number | null;
  }
): string {
  const searchParams = new URLSearchParams({ url });
  if (options.width) {
    searchParams.set("w", String(options.width));
  }
  if (options.height) {
    searchParams.set("h", String(options.height));
  }
  if (options.fit) {
    searchParams.set("fit", options.fit);
  }
  if (options.alignment) {
    searchParams.set("a", options.alignment);
  }
  if (options.trim) {
    searchParams.set("trim", options.trim);
  }
  if (options.output) {
    searchParams.set("output", options.output);
  }
  if (options.quality) {
    searchParams.set("q", String(options.quality));
  }
  return `${WSRV_BASE}?${searchParams.toString()}`;
}

async function fetchThumbnail(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), THUMBNAIL_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) return null;
    return response;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  const blockedResponse = requireStreamifyRequest(request);
  if (blockedResponse) return blockedResponse;

  const id = request.nextUrl.searchParams.get("id")?.trim() || "";
  const requestedVariant =
    request.nextUrl.searchParams.get("variant")?.trim() || DEFAULT_VARIANT;
  const useWebp = request.nextUrl.searchParams.get("webp") === "1";
  const width = parsePositiveInt(request.nextUrl.searchParams.get("w"));
  const height = parsePositiveInt(request.nextUrl.searchParams.get("h"));
  const fit = request.nextUrl.searchParams.get("fit")?.trim() || null;
  const alignment = request.nextUrl.searchParams.get("a")?.trim() || null;
  const trim = request.nextUrl.searchParams.get("trim")?.trim() || null;
  const output = request.nextUrl.searchParams.get("output")?.trim() || null;
  const quality = parseQuality(request.nextUrl.searchParams.get("q"));

  if (!id) {
    return NextResponse.json(
      { error: "YouTube thumbnail id is required" },
      { status: 400 }
    );
  }

  for (const variant of buildVariantFallbacks(requestedVariant, useWebp)) {
    const youtubeUrl = buildYouTubeThumbnailUrl(id, variant, useWebp);
    const proxiedUrl = buildWsrvUrl(youtubeUrl, {
      width,
      height,
      fit,
      alignment,
      trim,
      output,
      quality,
    });
    const response = await fetchThumbnail(proxiedUrl);

    if (!response) continue;

    const headers = new Headers();
    headers.set(
      "Content-Type",
      response.headers.get("content-type") || "image/jpeg"
    );
    headers.set(
      "Cache-Control",
      "public, max-age=3600, stale-while-revalidate=86400"
    );

    return new NextResponse(response.body, {
      status: 200,
      headers,
    });
  }

  return new NextResponse("YouTube thumbnail not found", { status: 404 });
}
