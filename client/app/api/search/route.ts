import { NextRequest, NextResponse } from "next/server";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const PIPED_INSTANCES = ["https://api.piped.private.coffee"];
const YTIFY_INSTANCE = "https://api.ytify.workers.dev";

const INVIDIOUS_INSTANCES = [
  "https://yt.omada.cafe",
  "https://invidious.tiekoetter.com",
  "https://yt.chocolatemoo53.com",
  "https://inv.nadeko.net",
];

type SearchResponse = { items: unknown[]; nextpage?: string | null };

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

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function getBackendBaseUrl(requestOrigin: string): string | null {
  // Disable backend proxying on Vercel - use local API routes instead
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
    return null;
  }

  const fromEnv =
    process.env.EXPRESS_API_URL ||
    process.env.SEARCH_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!fromEnv) return null;

  const normalized = normalizeBaseUrl(fromEnv);
  if (normalized === requestOrigin) return null;

  return normalized;
}

function mapFilterToInvidiousType(filter: string): string | null {
  const f = (filter || "").toLowerCase();
  if (!f || f === "all") return null;
  if (f === "videos" || f === "video") return "video";
  if (f === "playlists" || f === "playlist") return "playlist";
  if (f === "channels" || f === "channel" || f === "artists" || f === "artist")
    return "channel";
  return null;
}

function musicFilterMap(filter: string): string {
  const map: Record<string, string> = {
    songs: "music_songs",
    videos: "music_videos",
    albums: "music_albums",
    playlists: "music_playlists",
    channels: "music_artists",
    "": "music_songs",
  };
  return map[filter] || filter;
}

function absolutizeUrl(url: string, base: string): string {
  if (!url) return url;
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${base}${url}`;
  return url;
}

function rewriteInvidiousThumbs(item: unknown, instanceBase: string): unknown {
  const obj = item as Record<string, unknown>;
  const rewriteArray = (key: string) => {
    const arr = obj[key] as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(arr)) return;
    obj[key] = arr.map((t) => {
      const url = typeof t?.url === "string" ? t.url : "";
      return { ...t, url: absolutizeUrl(url, instanceBase) };
    });
  };
  rewriteArray("videoThumbnails");
  rewriteArray("authorThumbnails");
  return obj;
}

async function tryProxyToBackend(
  backendBaseUrl: string,
  searchParams: URLSearchParams
): Promise<SearchResponse | null> {
  const url = new URL(`${backendBaseUrl}/search`);
  searchParams.forEach((value, key) => {
    url.searchParams.append(key, value);
  });

  const res = await fetch(url.toString(), {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) return null;

  const data = (await res.json()) as unknown;
  const parsed = data as { items?: unknown[]; nextpage?: string | null };
  return { items: parsed.items ?? [], nextpage: parsed.nextpage ?? null };
}

async function searchPiped(
  query: string,
  filter: string,
  nextpage?: string
): Promise<SearchResponse> {
  const instance = PIPED_INSTANCES[0];
  const filterParam = filter === "" ? "all" : filter;
  const endpoint = nextpage
    ? `/nextpage/search?nextpage=${encodeURIComponent(nextpage)}`
    : `/search?q=${encodeURIComponent(query)}&filter=${encodeURIComponent(
        filterParam
      )}`;

  const res = await fetch(`${instance}${endpoint}`, {
    headers: { "User-Agent": USER_AGENT, accept: "application/json" },
    cache: "no-store",
    signal: withTimeout(undefined, 1800),
  });

  if (!res.ok) return { items: [], nextpage: null };

  const data = (await res.json()) as unknown;
  const parsed = data as { items?: unknown[]; nextpage?: string | null };
  const items = (parsed.items ?? []).map((item) => ({
    ...(item as Record<string, unknown>),
    source: "youtube",
  }));

  return { items, nextpage: parsed.nextpage ?? null };
}

function parseDurationToSeconds(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parts = value.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return undefined;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return undefined;
}

async function searchYtify(
  query: string,
  filter: string
): Promise<SearchResponse> {
  const f = (filter || "all").toLowerCase();
  const url = `${YTIFY_INSTANCE}/search?q=${encodeURIComponent(
    query
  )}&f=${encodeURIComponent(f === "" ? "all" : f)}`;

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) return { items: [], nextpage: null };
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return { items: [], nextpage: null };

  const items = data.map((entry) => {
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id : "";
    const type = typeof e.type === "string" ? e.type : "video";
    const title = typeof e.title === "string" ? e.title : "";
    const author = typeof e.author === "string" ? e.author : "";
    const authorId = typeof e.authorId === "string" ? e.authorId : "";
    const durationSeconds = parseDurationToSeconds(e.duration);

    const thumb = id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";

    return {
      source: "youtube",
      type: type === "video" ? "stream" : type,
      videoId: id,
      url: id ? `https://www.youtube.com/watch?v=${id}` : "",
      title,
      uploaderName: author,
      uploaderUrl: authorId
        ? `https://www.youtube.com/channel/${authorId}`
        : undefined,
      thumbnail: thumb,
      duration: durationSeconds,
      uploaded: typeof e.subtext === "string" ? e.subtext : undefined,
    } as Record<string, unknown>;
  });

  return { items, nextpage: null };
}

async function searchYouTubeMusic(
  query: string,
  filter: string,
  nextpage?: string
): Promise<SearchResponse> {
  const musicFilter = musicFilterMap(filter || "songs");
  const result = await searchPiped(query, musicFilter, nextpage);
  const items = result.items.map((item) => ({
    ...(item as Record<string, unknown>),
    source: "youtubemusic",
  }));
  return { items, nextpage: result.nextpage ?? null };
}

async function searchInvidious(
  query: string,
  filter: string,
  page: number
): Promise<SearchResponse> {
  const typeParam = mapFilterToInvidiousType(filter);

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = new URL(`${instance}/api/v1/search`);
      url.searchParams.set("q", query);
      url.searchParams.set("page", String(page));
      if (typeParam) url.searchParams.set("type", typeParam);

      const res = await fetch(url.toString(), {
        headers: { "User-Agent": USER_AGENT, accept: "application/json" },
        cache: "no-store",
      });

      if (!res.ok) continue;

      const data = (await res.json()) as unknown;
      if (!Array.isArray(data)) continue;

      const items = data.map((item) => ({
        ...(rewriteInvidiousThumbs(item, instance) as Record<string, unknown>),
        source: "youtube",
      }));

      return { items, nextpage: null };
    } catch {
      continue;
    }
  }

  return { items: [], nextpage: null };
}

async function searchSoundCloud(
  query: string,
  filter: string,
  page: number,
  limit: number
): Promise<SearchResponse> {
  const f = (filter || "").toLowerCase();
  const offset = (page - 1) * limit;

  if (f === "playlists" || f === "albums") {
    const scType = f === "playlists" ? "playlists" : "albums";
    const url = `https://proxy.searchsoundcloud.com/${scType}?q=${encodeURIComponent(
      query
    )}&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return { items: [], nextpage: null };

    const json = (await res.json()) as unknown;
    const data = json as {
      collection?: unknown[];
      results?: unknown[];
    };
    const collection = data?.collection ?? data?.results ?? [];
    const items = collection.map((c) => ({
      ...(c as Record<string, unknown>),
      type: scType === "playlists" ? "playlist" : "album",
      source: "soundcloud",
    }));
    return { items, nextpage: null };
  }

  const url = `https://proxy.searchsoundcloud.com/tracks?q=${encodeURIComponent(
    query
  )}&limit=${limit}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return { items: [], nextpage: null };

  const json = (await res.json()) as unknown;
  const data = json as { collection?: unknown[] };
  const items = (data.collection ?? []).map((t) => ({
    ...(t as Record<string, unknown>),
    source: "soundcloud",
  }));
  return { items, nextpage: null };
}

async function searchJioSaavn(query: string): Promise<SearchResponse> {
  try {
    const url = `https://streamifyjiosaavn.vercel.app/api/search?query=${encodeURIComponent(
      query
    )}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return { items: [], nextpage: null };
    const json = (await res.json()) as unknown;
    const data = json as { success?: boolean; data?: Record<string, unknown> };
    if (!data?.success) return { items: [], nextpage: null };

    const topQuery = (data.data?.topQuery as { results?: unknown[] })?.results;
    const songs = (data.data?.songs as { results?: unknown[] })?.results;
    const albums = (data.data?.albums as { results?: unknown[] })?.results;
    const artists = (data.data?.artists as { results?: unknown[] })?.results;

    const items: unknown[] = [];
    for (const entry of topQuery ?? []) {
      items.push({ ...(entry as Record<string, unknown>), source: "jiosaavn" });
    }
    for (const entry of songs ?? []) {
      items.push({ ...(entry as Record<string, unknown>), source: "jiosaavn" });
    }
    for (const entry of albums ?? []) {
      items.push({ ...(entry as Record<string, unknown>), source: "jiosaavn" });
    }
    for (const entry of artists ?? []) {
      items.push({ ...(entry as Record<string, unknown>), source: "jiosaavn" });
    }

    return { items, nextpage: null };
  } catch {
    return { items: [], nextpage: null };
  }
}
async function searchYouTubeDefault(
  query: string,
  filter: string,
  page: number,
  nextpage?: string
): Promise<SearchResponse> {
  const piped = await searchPiped(query, filter, nextpage);
  if (piped.items.length > 0) return piped;

  const invidious = await searchInvidious(query, filter, page);
  if (invidious.items.length > 0) return invidious;

  return searchYtify(query, filter);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q");

  const origin = request.nextUrl.origin;
  const backendBaseUrl = getBackendBaseUrl(origin);
  if (backendBaseUrl) {
    try {
      const proxied = await tryProxyToBackend(backendBaseUrl, searchParams);
      if (proxied) {
        return NextResponse.json(
          { items: proxied.items, nextpage: proxied.nextpage ?? null },
          { status: 200 }
        );
      }
    } catch {
      // fall through to built-in providers
    }
  }

  const sourceParam = (searchParams.get("source") || "youtube").toLowerCase();
  const filterParam = searchParams.get("filter") || "";
  const pageNum = parseInt(searchParams.get("page") || "1", 10) || 1;
  const limitNum = parseInt(searchParams.get("limit") || "20", 10) || 20;
  const nextpage = searchParams.get("nextpage") || undefined;

  try {
    let result: SearchResponse = { items: [], nextpage: null };

    switch (sourceParam) {
      case "piped":
        result = await searchPiped(q, filterParam, nextpage);
        break;
      case "youtube":
        result = await searchYouTubeDefault(q, filterParam, pageNum, nextpage);
        break;
      case "invidious":
        result = await searchInvidious(q, filterParam, pageNum);
        break;
      case "youtubemusic":
        result = await searchYouTubeMusic(q, filterParam, nextpage);
        if (result.items.length === 0) {
          result = await searchYtify(q, filterParam);
        }
        break;
      case "soundcloud":
        result = await searchSoundCloud(q, filterParam, pageNum, limitNum);
        break;
      case "jiosaavn":
        result = await searchJioSaavn(q);
        break;
      default:
        result = { items: [], nextpage: null };
    }

    return NextResponse.json(
      { items: result.items, nextpage: result.nextpage ?? null },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { items: [], error: "Search failed" },
      { status: 500 }
    );
  }
}
