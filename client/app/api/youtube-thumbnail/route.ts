import { NextRequest, NextResponse } from "next/server";
import { requireStreamifyRequest } from "../_lib/request-guard";
import { buildYouTubeThumbnailUrl } from "../../lib/youtube-thumbnails";

const WSRV_BASE = "https://wsrv.nl/";
const THUMBNAIL_TIMEOUT_MS = 8000;
const DEFAULT_VARIANT = "hqdefault.jpg";

function normalizeVariantRoot(value: string): string {
  const rawRoot = value.trim().toLowerCase().replace(/\.[a-z0-9]+$/, "");
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

function buildVariantFallbacks(requestedVariant: string, useWebp: boolean): string[] {
  const extension = useWebp ? "webp" : "jpg";
  const requestedRoot = normalizeVariantRoot(requestedVariant || DEFAULT_VARIANT);
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

function buildWsrvUrl(url: string): string {
  return `${WSRV_BASE}?url=${encodeURIComponent(url)}`;
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

  if (!id) {
    return NextResponse.json({ error: "YouTube thumbnail id is required" }, { status: 400 });
  }

  for (const variant of buildVariantFallbacks(requestedVariant, useWebp)) {
    const youtubeUrl = buildYouTubeThumbnailUrl(id, variant, useWebp);
    const proxiedUrl = buildWsrvUrl(youtubeUrl);
    const response = await fetchThumbnail(proxiedUrl);

    if (!response) continue;

    const headers = new Headers();
    headers.set("Content-Type", response.headers.get("content-type") || "image/jpeg");
    headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");

    return new NextResponse(response.body, {
      status: 200,
      headers,
    });
  }

  return new NextResponse("YouTube thumbnail not found", { status: 404 });
}
