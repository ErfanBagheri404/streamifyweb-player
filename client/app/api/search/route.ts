import { NextRequest, NextResponse } from "next/server";
import { requireStreamifyRequest } from "../_lib/request-guard";
import {
  getInvidiousInstances,
  getPipedInstances,
} from "../../lib/media-providers";
import {
  buildProviderUrlCandidates,
  getProviderEndpoints,
} from "../../lib/provider-endpoints";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

type SearchResponse = { items: unknown[]; nextpage?: string | null };

function reportDebugEvent(
  _runId: string,
  _hypothesisId: string,
  _location: string,
  _msg: string,
  _data: Record<string, unknown>
) {}

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

function upgradeSoundCloudImage(url: string): string {
  if (!url) return "";

  return url
    .replace("-large.", "-t500x500.")
    .replace("large.jpg", "t500x500.jpg")
    .replace("large.png", "t500x500.png");
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

async function fetchFirstSuccessfulJson(
  urls: string[]
): Promise<unknown | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, accept: "application/json" },
        cache: "no-store",
      });

      if (!res.ok) continue;
      return (await res.json()) as unknown;
    } catch {
      continue;
    }
  }

  return null;
}

async function searchPiped(
  query: string,
  filter: string,
  nextpage?: string
): Promise<SearchResponse> {
  const [instance] = await getPipedInstances();
  if (!instance) return { items: [], nextpage: null };
  const filterParam = filter === "" ? "all" : filter;
  const endpoint = nextpage
    ? `/nextpage/search?nextpage=${encodeURIComponent(nextpage)}`
    : `/search?q=${encodeURIComponent(query)}&filter=${encodeURIComponent(
        filterParam
      )}`;

  try {
    const res = await fetch(`${instance}${endpoint}`, {
      headers: { "User-Agent": USER_AGENT, accept: "application/json" },
      cache: "no-store",
      signal: withTimeout(undefined, 1800),
    });

    if (!res.ok) return { items: [], nextpage: null };

    const data = (await res.json()) as unknown;
    const parsed = data as { items?: unknown[]; nextpage?: string | null };
    const items = (parsed.items ?? []).map((item) => {
      const entry = item as Record<string, unknown>;
      // Prioritize videoId for the main 'id' field
      if (entry.videoId) {
        entry.id = entry.videoId;
      }
      // Fallback to parsing from URL if videoId is missing
      else if (
        typeof entry.url === "string" &&
        entry.url.includes("/watch?v=")
      ) {
        try {
          const videoId = new URL(
            "https://www.youtube.com" + entry.url
          ).searchParams.get("v");
          if (videoId) {
            entry.id = videoId;
          }
        } catch {
          // Ignore parsing errors
        }
      }
      return { ...entry, source: "youtube" };
    });

    return { items, nextpage: parsed.nextpage ?? null };
  } catch {
    return { items: [], nextpage: null };
  }
}

function parseDurationToSeconds(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parts = value.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return undefined;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return undefined;
}

function normalizeSearchItemType(item: Record<string, unknown>): string {
  const rawType =
    typeof item.type === "string" ? item.type.trim().toLowerCase() : "";

  if (rawType === "stream") return "video";
  if (rawType === "channel") return "artist";
  if (rawType) return rawType;

  if (item.duration != null || item.lengthSeconds != null) {
    return "song";
  }

  return "unknown";
}

function filterJioSaavnSearchItems(
  items: Array<Record<string, unknown>>,
  filter: string
): Array<Record<string, unknown>> {
  const normalizedFilter = (filter || "all").toLowerCase();
  if (!normalizedFilter || normalizedFilter === "all") return items;

  return items.filter((item) => {
    const itemType = normalizeSearchItemType(item);

    switch (normalizedFilter) {
      case "playlists":
        return itemType === "playlist";
      case "albums":
        return itemType === "album";
      case "artists":
      case "channels":
        return itemType === "artist";
      case "songs":
      case "tracks":
      case "videos":
        return itemType === "song" || itemType === "video";
      default:
        return true;
    }
  });
}

function interleaveSearchLists<T>(lists: T[][]): T[] {
  const output: T[] = [];
  const maxLength = Math.max(0, ...lists.map((list) => list.length));

  for (let index = 0; index < maxLength; index += 1) {
    for (const list of lists) {
      if (list[index]) {
        output.push(list[index]);
      }
    }
  }

  return output;
}

function dedupeSearchItems(items: unknown[]): unknown[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const entry = item as Record<string, unknown>;
    const source =
      typeof entry.source === "string" ? entry.source : "unknown-source";
    const identity =
      entry.id ??
      entry.videoId ??
      entry.playlistId ??
      entry.url ??
      entry.permalink_url ??
      entry.title;

    if (identity == null) return true;

    const key = `${source}:${String(identity)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildMixedSearchItems(providerItems: unknown[][]): unknown[] {
  const topResults: unknown[][] = [];
  const artists: unknown[][] = [];
  const playlists: unknown[][] = [];
  const albums: unknown[][] = [];
  const songs: unknown[][] = [];
  const others: unknown[][] = [];

  for (const items of providerItems) {
    const providerTop: unknown[] = [];
    const providerArtists: unknown[] = [];
    const providerPlaylists: unknown[] = [];
    const providerAlbums: unknown[] = [];
    const providerSongs: unknown[] = [];
    const providerOthers: unknown[] = [];

    for (const item of items) {
      const entry = item as Record<string, unknown>;
      const itemType = normalizeSearchItemType(entry);

      if (itemType === "unknown" || itemType === "hashtag") {
        providerTop.push(item);
      } else if (itemType === "artist") {
        providerArtists.push(item);
      } else if (itemType === "playlist") {
        providerPlaylists.push(item);
      } else if (itemType === "album") {
        providerAlbums.push(item);
      } else if (itemType === "song" || itemType === "video") {
        providerSongs.push(item);
      } else {
        providerOthers.push(item);
      }
    }

    topResults.push(providerTop);
    artists.push(providerArtists);
    playlists.push(providerPlaylists);
    albums.push(providerAlbums);
    songs.push(providerSongs);
    others.push(providerOthers);
  }

  return dedupeSearchItems([
    ...interleaveSearchLists(topResults),
    ...interleaveSearchLists(artists),
    ...interleaveSearchLists(playlists),
    ...interleaveSearchLists(albums),
    ...interleaveSearchLists(songs),
    ...interleaveSearchLists(others),
  ]);
}

async function searchYtify(
  query: string,
  filter: string
): Promise<SearchResponse> {
  const endpoints = await getProviderEndpoints();
  const ytifyInstance = endpoints.providers.search.ytifyInstance;
  const youtubeWebBase = endpoints.providers.youtube.webBase;
  const youtubeImageBase = endpoints.providers.youtube.imageBase;
  const f = (filter || "all").toLowerCase();
  const ytifyUrlCandidates = buildProviderUrlCandidates(
    ytifyInstance,
    ["/search"],
    {
      q: query,
      f: f === "" ? "all" : f,
    }
  );
  reportDebugEvent(
    `pre-ytify-${Date.now()}`,
    "B",
    "app/api/search/route.ts:searchYtify:candidates",
    "[DEBUG] ytify search candidate URLs built",
    {
      query,
      filter: f,
      ytifyInstance,
      ytifyUrlCandidates,
    }
  );
  const data = await fetchFirstSuccessfulJson(ytifyUrlCandidates);
  if (!Array.isArray(data)) return { items: [], nextpage: null };

  const items = data.map((entry) => {
    const e = entry as Record<string, unknown>;
    let id = typeof e.id === "string" ? e.id : "";

    // Extract video ID from YouTube URL if id contains full URL
    if (id.includes("youtube.com/watch?v=")) {
      const match = id.match(/[?&]v=([^&]+)/);
      if (match?.[1]) {
        id = match[1];
      }
    }

    const type = typeof e.type === "string" ? e.type : "video";
    const title = typeof e.title === "string" ? e.title : "";
    const author = typeof e.author === "string" ? e.author : "";
    const authorId = typeof e.authorId === "string" ? e.authorId : "";
    const durationSeconds = parseDurationToSeconds(e.duration);

    const thumb = id ? `${youtubeImageBase}/vi/${id}/hqdefault.jpg` : "";

    return {
      source: "youtube",
      type: type === "video" ? "stream" : type,
      id: id, // Use 'id' field instead of 'videoId' to match frontend expectations
      videoId: id, // Keep videoId for compatibility
      url: id ? `${youtubeWebBase}/watch?v=${id}` : "",
      title,
      uploaderName: author,
      uploaderUrl: authorId
        ? `${youtubeWebBase}/channel/${authorId}`
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
  const items = result.items.map((item) => {
    const entry = item as Record<string, unknown>;
    const videoId = entry.videoId as string | undefined;
    if (videoId) {
      entry.id = videoId;
    }
    return {
      ...entry,
      source: "youtubemusic",
    };
  });
  return { items, nextpage: result.nextpage ?? null };
}

async function searchInvidious(
  query: string,
  filter: string,
  page: number
): Promise<SearchResponse> {
  const typeParam = mapFilterToInvidiousType(filter);
  const invidiousInstances = await getInvidiousInstances();

  for (const instance of invidiousInstances) {
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

      const items = data.map((item) => {
        const entry = rewriteInvidiousThumbs(item, instance) as Record<
          string,
          unknown
        >;
        // Prioritize videoId for the main 'id' field
        if (entry.videoId) {
          entry.id = entry.videoId;
        }
        // Invidious usually provides videoId, this is a fallback
        else if (
          typeof entry.url === "string" &&
          entry.url.includes("/watch?v=")
        ) {
          try {
            const videoId = new URL(
              "https://www.youtube.com" + entry.url
            ).searchParams.get("v");
            if (videoId) {
              entry.id = videoId;
            }
          } catch {
            /* ignore */
          }
        }
        return { ...entry, source: "youtube" };
      });

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
  const endpoints = await getProviderEndpoints();
  const beatseekBase = endpoints.providers.beatseek.apiBase;
  const soundcloudSearchProxyBase =
    endpoints.providers.search.soundcloudSearchProxyBase;
  const normalizeTrackDuration = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value > 10000 ? Math.floor(value / 1000) : Math.floor(value);
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed > 10000 ? Math.floor(parsed / 1000) : Math.floor(parsed);
      }
    }
    return undefined;
  };

  const normalizeTrackItem = (input: Record<string, unknown>) => {
    const user =
      input.user && typeof input.user === "object"
        ? (input.user as Record<string, unknown>)
        : {};

    return {
      ...input,
      id: input.id || input.permalink_url || input.url,
      title: input.title,
      author:
        user.username ||
        (typeof input.author === "string" ? input.author : undefined) ||
        "Unknown Artist",
      thumbnailUrl:
        input.artwork_url ||
        input.thumbnailUrl ||
        input.thumbnail ||
        user.avatar_url,
      url: input.permalink_url || input.permalinkUrl || input.url || input.href,
      duration: normalizeTrackDuration(input.duration),
      source: "soundcloud",
    };
  };

  const f = (filter || "").toLowerCase();
  const offset = (page - 1) * limit;
  try {
    if (f === "playlists" || f === "albums") {
      const beatseekUrls = buildProviderUrlCandidates(
        beatseekBase,
        ["/search", "/api/search"],
        {
          query,
          platform: "soundcloud",
          type: f,
          sort: "both",
          limit,
        }
      );
      const beatseekUrl = beatseekUrls[0] || "";
      // #region debug-point B:soundcloud-search-upstream-start
      reportDebugEvent(
        `pre-soundcloud-${Date.now()}`,
        "B",
        "app/api/search/route.ts:searchSoundCloud:upstream-start",
        "[DEBUG] SoundCloud collection search hitting Beatseek",
        {
          query,
          filter: f,
          page,
          limit,
          beatseekUrl,
          beatseekUrls,
        }
      );
      // #endregion
      const json = await fetchFirstSuccessfulJson(beatseekUrls);

      if (!json) {
        // #region debug-point B:soundcloud-search-upstream-non-ok
        reportDebugEvent(
          `pre-soundcloud-${Date.now()}`,
          "B",
          "app/api/search/route.ts:searchSoundCloud:upstream-non-ok",
          "[DEBUG] SoundCloud collection search upstream returned non-OK",
          {
            query,
            filter: f,
            candidateCount: beatseekUrls.length,
          }
        );
        // #endregion
        return { items: [], nextpage: null };
      }
      const results = (json as { results?: unknown[] }).results ?? [];
      // #region debug-point B:soundcloud-search-upstream-success
      reportDebugEvent(
        `pre-soundcloud-${Date.now()}`,
        "B",
        "app/api/search/route.ts:searchSoundCloud:upstream-success",
        "[DEBUG] SoundCloud collection search upstream payload parsed",
        {
          query,
          filter: f,
          resultCount: Array.isArray(results) ? results.length : -1,
          payloadKeys:
            json && typeof json === "object" && !Array.isArray(json)
              ? Object.keys(json as Record<string, unknown>)
              : [],
          firstUrl:
            Array.isArray(results) && results[0]
              ? String((results[0] as Record<string, unknown>).url ?? "")
              : null,
        }
      );
      // #endregion
      const items = results.map((entry) => {
        const record = entry as Record<string, unknown>;
        const artwork = upgradeSoundCloudImage(
          (record.artworkUrl as string) || ""
        );

        return {
          ...record,
          id: String(record.id || record.url || ""),
          url: record.url || "",
          href: record.url || "",
          title: record.title || "",
          author: record.artist || "",
          thumbnailUrl: artwork,
          img: artwork,
          videoCount:
            typeof record.trackCount === "number"
              ? record.trackCount
              : typeof record.trackCount === "string"
              ? Number.parseInt(record.trackCount, 10)
              : undefined,
          duration: normalizeTrackDuration(record.duration),
          uploaded:
            typeof record.createdAt === "string" ? record.createdAt : undefined,
          type: f === "albums" ? "album" : "playlist",
          source: "soundcloud",
        };
      });

      return { items, nextpage: null };
    }

    const proxyUrlCandidates = buildProviderUrlCandidates(
      soundcloudSearchProxyBase,
      ["/tracks", "/api/tracks"],
      { q: query, limit, offset }
    );
    reportDebugEvent(
      `pre-soundcloud-${Date.now()}`,
      "B",
      "app/api/search/route.ts:searchSoundCloud:track-candidates",
      "[DEBUG] SoundCloud track search candidate URLs built",
      {
        query,
        filter: f,
        soundcloudSearchProxyBase,
        proxyUrlCandidates,
      }
    );
    const json = await fetchFirstSuccessfulJson(proxyUrlCandidates);
    if (!json) return { items: [], nextpage: null };
    const data = json as { collection?: unknown[]; results?: unknown[] };
    const collection = data.collection ?? data.results ?? [];

    const items = collection.map((entry) =>
      normalizeTrackItem(entry as Record<string, unknown>)
    );
    return { items, nextpage: null };
  } catch (error) {
    // #region debug-point B:soundcloud-search-exception
    reportDebugEvent(
      `pre-soundcloud-${Date.now()}`,
      "B",
      "app/api/search/route.ts:searchSoundCloud:exception",
      "[DEBUG] SoundCloud search threw exception",
      {
        query,
        filter: f,
        page,
        limit,
        error: error instanceof Error ? error.message : String(error),
      }
    );
    // #endregion
    return { items: [], nextpage: null };
  }
}

async function searchJioSaavn(
  query: string,
  filter = "all"
): Promise<SearchResponse> {
  try {
    const endpoints = await getProviderEndpoints();
    const jiosaavnUrlCandidates = buildProviderUrlCandidates(
      endpoints.providers.jiosaavn.apiBase,
      ["/api/search", "/search"],
      { query }
    );
    reportDebugEvent(
      `pre-jiosaavn-${Date.now()}`,
      "B",
      "app/api/search/route.ts:searchJioSaavn:candidates",
      "[DEBUG] JioSaavn search candidate URLs built",
      {
        query,
        apiBase: endpoints.providers.jiosaavn.apiBase,
        jiosaavnUrlCandidates,
      }
    );
    const json = await fetchFirstSuccessfulJson(jiosaavnUrlCandidates);
    if (!json) return { items: [], nextpage: null };
    const data = json as { success?: boolean; data?: Record<string, unknown> };
    if (!data?.success) return { items: [], nextpage: null };

    const topQuery = (data.data?.topQuery as { results?: unknown[] })?.results;
    const songs = (data.data?.songs as { results?: unknown[] })?.results;
    const albums = (data.data?.albums as { results?: unknown[] })?.results;
    const artists = (data.data?.artists as { results?: unknown[] })?.results;
    const playlists = (data.data?.playlists as { results?: unknown[] })
      ?.results;

    const items: Array<Record<string, unknown>> = [];
    for (const entry of topQuery ?? []) {
      const item: Record<string, unknown> = {
        ...(entry as Record<string, unknown>),
        source: "jiosaavn",
      };
      // Ensure the entry has the correct 'id' field for the frontend
      if (!item.id && typeof item.videoId === "string") {
        item.id = item.videoId;
      }
      items.push(item);
    }
    for (const entry of songs ?? []) {
      const item: Record<string, unknown> = {
        ...(entry as Record<string, unknown>),
        source: "jiosaavn",
      };
      // Ensure the entry has the correct 'id' field for the frontend
      if (!item.id && typeof item.videoId === "string") {
        item.id = item.videoId;
      }
      items.push(item);
    }
    for (const entry of albums ?? []) {
      const item: Record<string, unknown> = {
        ...(entry as Record<string, unknown>),
        source: "jiosaavn",
      };
      // Ensure the entry has the correct 'id' field for the frontend
      if (!item.id && typeof item.videoId === "string") {
        item.id = item.videoId;
      }
      items.push(item);
    }
    for (const entry of artists ?? []) {
      const item: Record<string, unknown> = {
        ...(entry as Record<string, unknown>),
        source: "jiosaavn",
      };
      // Ensure the entry has the correct 'id' field for the frontend
      if (!item.id && typeof item.videoId === "string") {
        item.id = item.videoId;
      }
      items.push(item);
    }
    for (const entry of playlists ?? []) {
      const item: Record<string, unknown> = {
        ...(entry as Record<string, unknown>),
        source: "jiosaavn",
        type: "playlist",
      };
      if (!item.id && typeof item.videoId === "string") {
        item.id = item.videoId;
      }
      items.push(item);
    }

    return {
      items: filterJioSaavnSearchItems(items, filter),
      nextpage: null,
    };
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

async function searchMixed(
  query: string,
  filter: string,
  page: number,
  limit: number
): Promise<SearchResponse> {
  const normalizedFilter = (filter || "all").toLowerCase();
  const youtubeFilter =
    normalizedFilter === "playlists" ? "playlists" : "all";
  const youtubeMusicFilter =
    normalizedFilter === "playlists" ? "playlists" : "all";
  const soundCloudTasks =
    normalizedFilter === "playlists"
      ? [searchSoundCloud(query, "playlists", page, limit)]
      : [
          searchSoundCloud(query, "tracks", page, limit),
          searchSoundCloud(query, "playlists", page, Math.max(8, limit / 2)),
          searchSoundCloud(query, "albums", page, Math.max(8, limit / 2)),
        ];

  const [youtubeResult, youtubeMusicResult, jioSaavnResult, ...soundCloudResults] =
    await Promise.all([
      searchYouTubeDefault(query, youtubeFilter, page),
      searchYouTubeMusic(query, youtubeMusicFilter),
      searchJioSaavn(query, normalizedFilter),
      ...soundCloudTasks,
    ]);

  const items = buildMixedSearchItems([
    youtubeResult.items,
    youtubeMusicResult.items,
    ...soundCloudResults.map((result) => result.items),
    jioSaavnResult.items,
  ]).slice(0, Math.max(limit * 3, 40));

  return { items, nextpage: null };
}

export async function GET(request: NextRequest) {
  const blockedResponse = requireStreamifyRequest(request);
  if (blockedResponse) return blockedResponse;

  const searchParams = request.nextUrl.searchParams;
  const q = (searchParams.get("q") || "").trim();
  const sourceParam = (searchParams.get("source") || "mixed").toLowerCase();
  const filterParam = searchParams.get("filter") || "";
  const pageNum = parseInt(searchParams.get("page") || "1", 10) || 1;
  const limitNum = parseInt(searchParams.get("limit") || "20", 10) || 20;
  const nextpage = searchParams.get("nextpage") || undefined;
  const runId = `pre-${Date.now()}`;

  // #region debug-point A:search-route-entry
  reportDebugEvent(
    runId,
    "A",
    "app/api/search/route.ts:GET:entry",
    "[DEBUG] /api/search request received",
    {
      url: request.url,
      q,
      sourceParam,
      filterParam,
      pageNum,
      limitNum,
      nextpage,
    }
  );
  // #endregion

  const origin = request.nextUrl.origin;
  const backendBaseUrl = getBackendBaseUrl(origin);
  // #region debug-point A:search-route-proxy-config
  reportDebugEvent(
    runId,
    "A",
    "app/api/search/route.ts:GET:proxy-config",
    "[DEBUG] search route proxy configuration",
    {
      origin,
      backendBaseUrl,
      sourceParam,
      filterParam,
    }
  );
  // #endregion
  if (backendBaseUrl) {
    try {
      const proxied = await tryProxyToBackend(backendBaseUrl, searchParams);
      if (proxied && (proxied.items.length > 0 || proxied.nextpage)) {
        // #region debug-point B:search-route-proxy-success
        reportDebugEvent(
          runId,
          "B",
          "app/api/search/route.ts:GET:proxy-success",
          "[DEBUG] search route used backend proxy",
          {
            backendBaseUrl,
            sourceParam,
            filterParam,
            itemCount: proxied.items.length,
            nextpage: proxied.nextpage ?? null,
          }
        );
        // #endregion
        return NextResponse.json(
          { items: proxied.items, nextpage: proxied.nextpage ?? null },
          { status: 200 }
        );
      }
      reportDebugEvent(
        runId,
        "B",
        "app/api/search/route.ts:GET:proxy-empty-fallback",
        "[DEBUG] backend proxy returned empty result and route will fall back to built-in providers",
        {
          backendBaseUrl,
          sourceParam,
          filterParam,
          itemCount: proxied?.items.length ?? 0,
          nextpage: proxied?.nextpage ?? null,
        }
      );
    } catch (error) {
      // #region debug-point E:search-backend-proxy-failed
      reportDebugEvent(
        runId,
        "E",
        "app/api/search/route.ts:GET:backend-proxy-failed",
        "[DEBUG] backend proxy failed",
        {
          backendBaseUrl,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      // #endregion
      // fall through to built-in providers
    }
  }

  if (!q) {
    return NextResponse.json({ items: [], nextpage: null }, { status: 200 });
  }

  try {
    let result: SearchResponse = { items: [], nextpage: null };

    // #region debug-point B:search-branch
    reportDebugEvent(
      runId,
      "B",
      "app/api/search/route.ts:GET:branch",
      "[DEBUG] selecting search provider branch",
      {
        sourceParam,
        hasQuery: Boolean(q),
        filterParam,
        pageNum,
        nextpage,
      }
    );
    // #endregion

    switch (sourceParam) {
      case "mixed":
        result = await searchMixed(q, filterParam, pageNum, limitNum);
        break;
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
        // #region debug-point B:search-route-soundcloud-result
        reportDebugEvent(
          runId,
          "B",
          "app/api/search/route.ts:GET:soundcloud-result",
          "[DEBUG] search route used built-in SoundCloud provider",
          {
            sourceParam,
            filterParam,
            pageNum,
            limitNum,
            itemCount: result.items.length,
            sampleId:
              Array.isArray(result.items) && result.items[0]
                ? String(
                    (result.items[0] as Record<string, unknown>).id ??
                      (result.items[0] as Record<string, unknown>).url ??
                      ""
                  )
                : null,
          }
        );
        // #endregion
        break;
      case "jiosaavn":
        result = await searchJioSaavn(q, filterParam);
        break;
      default:
        result = { items: [], nextpage: null };
    }

    // #region debug-point C:search-route-success
    reportDebugEvent(
      runId,
      "C",
      "app/api/search/route.ts:GET:success",
      "[DEBUG] /api/search completed",
      {
        sourceParam,
        itemCount: Array.isArray(result.items) ? result.items.length : -1,
        nextpage: result.nextpage ?? null,
      }
    );
    // #endregion

    return NextResponse.json(
      { items: result.items, nextpage: result.nextpage ?? null },
      { status: 200 }
    );
  } catch (error) {
    // #region debug-point D:search-route-failed
    reportDebugEvent(
      runId,
      "D",
      "app/api/search/route.ts:GET:failed",
      "[DEBUG] /api/search failed",
      {
        sourceParam,
        q,
        filterParam,
        pageNum,
        nextpage,
        error: error instanceof Error ? error.message : String(error),
        stack:
          error instanceof Error && error.stack
            ? error.stack.split("\n").slice(0, 5).join("\n")
            : null,
      }
    );
    // #endregion
    return NextResponse.json(
      { items: [], error: "Search failed" },
      { status: 500 }
    );
  }
}
