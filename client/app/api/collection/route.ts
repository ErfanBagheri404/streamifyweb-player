import { NextRequest, NextResponse } from "next/server";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const JIOSAAVN_API_BASE = "https://streamifyjiosaavn.vercel.app";

function toRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function toArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${text}`);
  }

  return res.json() as Promise<unknown>;
}

function qualityScore(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/(\d+)/);
    if (match) return Number(match[1]);
  }
  return 0;
}

function pickImageUrl(value: unknown): string {
  const images = toArray(value)
    .map((entry) => toRecord(entry))
    .sort(
      (a, b) => qualityScore(b.quality || b.size) - qualityScore(a.quality || a.size)
    );

  for (const image of images) {
    const url = safeString(image.url || image.link);
    if (url) return url;
  }

  return "";
}

function pickArtistName(value: unknown): string {
  const artists = toRecord(value);
  const groups = [artists.primary, artists.featured, artists.all];

  for (const group of groups) {
    const names = toArray(group)
      .map((entry) => safeString(toRecord(entry).name))
      .filter(Boolean);
    if (names.length) return names.join(", ");
  }

  return "";
}

function normalizeSong(song: unknown) {
  const record = toRecord(song);
  return {
    id: safeString(record.id || record.songid || record.url),
    title: safeString(record.name || record.title || record.song) || "Unknown",
    subtitle: pickArtistName(record.artists),
    artist: pickArtistName(record.artists),
    thumbnailUrl: pickImageUrl(record.image),
    duration: safeNumber(record.duration),
    url: safeString(record.url),
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get("id");
  const kind = searchParams.get("kind");
  const source = (searchParams.get("source") || "").toLowerCase();

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (source !== "jiosaavn" || kind !== "album") {
    return NextResponse.json({ error: "Unsupported collection source" }, { status: 400 });
  }

  try {
    const payload = (await fetchJson(
      `${JIOSAAVN_API_BASE}/api/albums?id=${encodeURIComponent(id)}`
    )) as Record<string, unknown>;
    const album = toRecord(payload.data);

    if (!Object.keys(album).length) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const author = pickArtistName(album.artists);
    const entries = toArray(album.songs)
      .map((song) => normalizeSong(song))
      .filter((entry) => entry.id);

    return NextResponse.json({
      collection: {
        id: safeString(album.id || id),
        title: safeString(album.name || album.title) || "Album",
        author,
        thumbnailUrl: pickImageUrl(album.image),
        url: safeString(album.url),
        count: safeNumber(album.songCount) ?? entries.length,
        source: "jiosaavn",
      },
      entries,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load collection",
      },
      { status: 500 }
    );
  }
}
