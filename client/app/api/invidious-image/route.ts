import { NextRequest, NextResponse } from "next/server";
import { requireStreamifyRequest } from "../_lib/request-guard";
import { getInvidiousInstances } from "../../lib/media-providers";

const IMAGE_FETCH_TIMEOUT_MS = 10000;

function buildCandidateUrls(rawUrl: string, instances: string[]): string[] {
  try {
    const parsed = new URL(rawUrl);
    const directUrl = parsed.toString();
    const matchingInstance = instances.find((instance) => {
      try {
        return new URL(instance).host === parsed.host;
      } catch {
        return false;
      }
    });

    if (!matchingInstance) {
      return [directUrl];
    }

    const pathAndSearch = `${parsed.pathname}${parsed.search}`;
    const fallbackUrls = instances.map((instance) => `${instance}${pathAndSearch}`);
    return [...new Set([directUrl, ...fallbackUrls])];
  } catch {
    return [];
  }
}

async function fetchFirstImage(urls: string[]): Promise<Response | null> {
  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().startsWith("image/")) continue;
      return response;
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  const blockedResponse = requireStreamifyRequest(request);
  if (blockedResponse) return blockedResponse;

  const rawUrl = request.nextUrl.searchParams.get("url")?.trim() || "";
  if (!rawUrl) {
    return NextResponse.json(
      { error: "Invidious image url is required" },
      { status: 400 }
    );
  }

  const candidateUrls = buildCandidateUrls(rawUrl, await getInvidiousInstances());
  if (candidateUrls.length === 0) {
    return new NextResponse("Invalid image url", { status: 400 });
  }

  const response = await fetchFirstImage(candidateUrls);
  if (!response) {
    return new NextResponse("Image not found", { status: 404 });
  }

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
