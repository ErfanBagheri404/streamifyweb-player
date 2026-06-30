import type { WorkerConfig } from "../config";
import { buildProviderUrlCandidates } from "../config";
import {
  absolutizeUrl,
  json,
  toArray,
  toNumber,
  toRecord,
  withTimeout,
} from "../http";

type SearchResponse = { items: unknown[]; nextpage?: string | null };

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function extractYouTubeVideoId(value: string): string {
  const rawValue = value.trim();
  if (!rawValue) return "";

  const watchMatch = rawValue.match(/[?&]v=([^&]+)/);
  if (watchMatch?.[1]) return watchMatch[1];

  const shortMatch = rawValue.match(/youtu\.be\/([^?]+)/);
  if (shortMatch?.[1]) return shortMatch[1];

  const pathMatch = rawValue.match(/\/watch\/([^/?#]+)/);
  if (pathMatch?.[1]) return pathMatch[1];

  return "";
}

function buildYouTubeThumbnailUrl(
  config: WorkerConfig,
  videoId: string,
  variant = "hqdefault.jpg"
): string {
  return `${config.providers.youtube.imageBase}/vi/${encodeURIComponent(
    videoId
  )}/${variant}`;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function mapFilterToInvidiousType(filter: string): string | null {
  const normalized = (filter || "").toLowerCase();
  if (!normalized || normalized === "all") return null;
  if (normalized === "videos" || normalized === "video") return "video";
  if (normalized === "playlists" || normalized === "playlist")
    return "playlist";
  if (
    normalized === "channels" ||
    normalized === "channel" ||
    normalized === "artists" ||
    normalized === "artist"
  ) {
    return "channel";
  }
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

function upgradeSoundCloudImage(url: string): string {
  if (!url) return "";

  return url
    .replace("-large.", "-t500x500.")
    .replace("large.jpg", "t500x500.jpg")
    .replace("large.png", "t500x500.png");
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, accept: "application/json" },
    cache: "no-store",
    signal: withTimeout(undefined, timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json() as Promise<unknown>;
}

async function fetchFirstSuccessfulJson(
  urls: string[],
  timeoutMs = 8000
): Promise<unknown | null> {
  for (const url of urls) {
    try {
      return await fetchJson(url, timeoutMs);
    } catch {
      continue;
    }
  }

  return null;
}

function rewriteInvidiousThumbs(
  item: unknown,
  instanceBase: string,
  config: WorkerConfig
): unknown {
  const entry = item as Record<string, unknown>;
  const videoId =
    typeof entry.videoId === "string"
      ? entry.videoId
      : typeof entry.id === "string"
      ? entry.id
      : extractYouTubeVideoId(typeof entry.url === "string" ? entry.url : "");
  const rewriteThumbnailArray = (key: string) => {
    const arr = entry[key] as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(arr)) return;
    entry[key] = arr.map((thumbnail) => {
      const url = typeof thumbnail?.url === "string" ? thumbnail.url : "";
      return {
        ...thumbnail,
        url:
          videoId && config.providers.youtube.imageBase
            ? buildYouTubeThumbnailUrl(config, videoId)
            : absolutizeUrl(url, instanceBase),
      };
    });
  };
  const rewriteAbsoluteArray = (key: string) => {
    const arr = entry[key] as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(arr)) return;
    entry[key] = arr.map((thumbnail) => {
      const url = typeof thumbnail?.url === "string" ? thumbnail.url : "";
      return { ...thumbnail, url: absolutizeUrl(url, instanceBase) };
    });
  };

  rewriteThumbnailArray("videoThumbnails");
  rewriteAbsoluteArray("authorThumbnails");

  if (typeof entry.thumbnail === "string") {
    entry.thumbnail =
      videoId && config.providers.youtube.imageBase
        ? buildYouTubeThumbnailUrl(config, videoId)
        : absolutizeUrl(entry.thumbnail, instanceBase);
  }
  if (typeof entry.thumbnailUrl === "string") {
    entry.thumbnailUrl =
      videoId && config.providers.youtube.imageBase
        ? buildYouTubeThumbnailUrl(config, videoId)
        : absolutizeUrl(entry.thumbnailUrl, instanceBase);
  }

  return entry;
}

async function searchPiped(
  query: string,
  filter: string,
  nextpage: string | undefined,
  config: WorkerConfig
): Promise<SearchResponse> {
  const instance = config.instances.piped[0];
  if (!instance) return { items: [], nextpage: null };

  const filterParam = filter === "" ? "all" : filter;
  const endpoint = nextpage
    ? `/nextpage/search?nextpage=${encodeURIComponent(nextpage)}`
    : `/search?q=${encodeURIComponent(query)}&filter=${encodeURIComponent(
        filterParam
      )}`;

  try {
    const data = (await fetchJson(`${instance}${endpoint}`, 1800)) as {
      items?: unknown[];
      nextpage?: string | null;
    };
    const items = (data.items ?? []).map((item) => {
      const entry = item as Record<string, unknown>;
      if (entry.videoId) {
        entry.id = entry.videoId;
      } else if (
        typeof entry.url === "string" &&
        entry.url.includes("/watch?v=")
      ) {
        try {
          const videoId = new URL(
            `${config.providers.youtube.webBase}${entry.url}`
          ).searchParams.get("v");
          if (videoId) {
            entry.id = videoId;
          }
        } catch {}
      }

      const videoId =
        typeof entry.videoId === "string"
          ? entry.videoId
          : typeof entry.id === "string"
          ? entry.id
          : extractYouTubeVideoId(
              typeof entry.url === "string" ? entry.url : ""
            );

      if (typeof entry.thumbnail === "string" && videoId) {
        entry.thumbnail = buildYouTubeThumbnailUrl(config, videoId);
      }
      if (typeof entry.thumbnailUrl === "string" && videoId) {
        entry.thumbnailUrl = buildYouTubeThumbnailUrl(config, videoId);
      }
      if (Array.isArray(entry.videoThumbnails)) {
        entry.videoThumbnails = entry.videoThumbnails.map((thumbnail) => {
          const record =
            thumbnail &&
            typeof thumbnail === "object" &&
            !Array.isArray(thumbnail)
              ? (thumbnail as Record<string, unknown>)
              : {};
          return {
            ...record,
            url:
              videoId && config.providers.youtube.imageBase
                ? buildYouTubeThumbnailUrl(config, videoId)
                : typeof record.url === "string"
                ? absolutizeUrl(record.url, instance)
                : record.url,
          };
        });
      }

      return { ...entry, source: "youtube" };
    });

    return { items, nextpage: data.nextpage ?? null };
  } catch {
    return { items: [], nextpage: null };
  }
}

function parseDurationToSeconds(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parts = value.split(":").map((part) => parseInt(part, 10));
  if (parts.some((numeric) => Number.isNaN(numeric))) return undefined;
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
  filter: string,
  config: WorkerConfig
): Promise<SearchResponse> {
  const normalizedFilter = (filter || "all").toLowerCase();
  const candidates = buildProviderUrlCandidates(
    config.providers.search.ytifyInstance,
    ["/search"],
    {
      q: query,
      f: normalizedFilter === "" ? "all" : normalizedFilter,
    }
  );
  const data = await fetchFirstSuccessfulJson(candidates);
  if (!Array.isArray(data)) return { items: [], nextpage: null };

  const items = data.map((entry) => {
    const record = entry as Record<string, unknown>;
    let id = typeof record.id === "string" ? record.id : "";

    if (id.includes("youtube.com/watch?v=")) {
      const match = id.match(/[?&]v=([^&]+)/);
      if (match?.[1]) {
        id = match[1];
      }
    }

    const type = typeof record.type === "string" ? record.type : "video";
    const title = typeof record.title === "string" ? record.title : "";
    const author = typeof record.author === "string" ? record.author : "";
    const authorId = typeof record.authorId === "string" ? record.authorId : "";
    const durationSeconds = parseDurationToSeconds(record.duration);

    return {
      source: "youtube",
      type: type === "video" ? "stream" : type,
      id,
      videoId: id,
      url: id ? `${config.providers.youtube.webBase}/watch?v=${id}` : "",
      title,
      uploaderName: author,
      uploaderUrl: authorId
        ? `${config.providers.youtube.webBase}/channel/${authorId}`
        : undefined,
      thumbnail: id ? buildYouTubeThumbnailUrl(config, id) : "",
      duration: durationSeconds,
      uploaded: typeof record.subtext === "string" ? record.subtext : undefined,
    } as Record<string, unknown>;
  });

  return { items, nextpage: null };
}

async function searchYouTubeMusic(
  query: string,
  filter: string,
  nextpage: string | undefined,
  config: WorkerConfig
): Promise<SearchResponse> {
  const musicFilter = musicFilterMap(filter || "songs");
  const result = await searchPiped(query, musicFilter, nextpage, config);
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
  page: number,
  config: WorkerConfig
): Promise<SearchResponse> {
  const typeParam = mapFilterToInvidiousType(filter);

  for (const instance of config.instances.invidious) {
    try {
      const url = new URL(`${instance}/api/v1/search`);
      url.searchParams.set("q", query);
      url.searchParams.set("page", String(page));
      if (typeParam) url.searchParams.set("type", typeParam);

      const data = await fetchJson(url.toString(), 8000);
      if (!Array.isArray(data)) continue;

      const items = data.map((item) => {
        const entry = rewriteInvidiousThumbs(item, instance, config) as Record<
          string,
          unknown
        >;
        if (entry.videoId) {
          entry.id = entry.videoId;
        } else if (
          typeof entry.url === "string" &&
          entry.url.includes("/watch?v=")
        ) {
          try {
            const videoId = new URL(
              `${config.providers.youtube.webBase}${entry.url}`
            ).searchParams.get("v");
            if (videoId) entry.id = videoId;
          } catch {}
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
  limit: number,
  config: WorkerConfig
): Promise<SearchResponse> {
  const normalizeTrackDuration = (value: unknown): number | undefined => {
    const numeric = toNumber(value);
    if (numeric == null) return undefined;
    return numeric > 10000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
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

  const normalizedFilter = (filter || "").toLowerCase();
  const offset = (page - 1) * limit;

  try {
    if (normalizedFilter === "playlists" || normalizedFilter === "albums") {
      const beatseekUrls = buildProviderUrlCandidates(
        config.providers.beatseek.apiBase,
        ["/search", "/api/search"],
        {
          query,
          platform: "soundcloud",
          type: normalizedFilter,
          sort: "both",
          limit,
        }
      );
      const payload = (await fetchFirstSuccessfulJson(beatseekUrls, 12000)) as {
        results?: unknown[];
      } | null;
      const results = payload?.results ?? [];

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
          type: normalizedFilter === "albums" ? "album" : "playlist",
          source: "soundcloud",
        };
      });

      return { items, nextpage: null };
    }

    const proxyUrlCandidates = buildProviderUrlCandidates(
      config.providers.search.soundcloudSearchProxyBase,
      ["/tracks", "/api/tracks"],
      { q: query, limit, offset }
    );
    const payload = (await fetchFirstSuccessfulJson(
      proxyUrlCandidates,
      12000
    )) as { collection?: unknown[]; results?: unknown[] } | null;
    const collection = payload?.collection ?? payload?.results ?? [];

    const items = collection.map((entry) =>
      normalizeTrackItem(entry as Record<string, unknown>)
    );
    return { items, nextpage: null };
  } catch {
    return { items: [], nextpage: null };
  }
}

async function searchJioSaavn(
  query: string,
  filter: string,
  config: WorkerConfig
): Promise<SearchResponse> {
  try {
    const candidates = buildProviderUrlCandidates(
      config.providers.jiosaavn.apiBase,
      ["/api/search", "/search"],
      { query }
    );
    const payload = (await fetchFirstSuccessfulJson(candidates, 12000)) as {
      success?: boolean;
      data?: Record<string, unknown>;
    } | null;
    if (!payload?.success) return { items: [], nextpage: null };

    const topQuery = (payload.data?.topQuery as { results?: unknown[] })
      ?.results;
    const songs = (payload.data?.songs as { results?: unknown[] })?.results;
    const albums = (payload.data?.albums as { results?: unknown[] })?.results;
    const artists = (payload.data?.artists as { results?: unknown[] })?.results;
    const playlists = (payload.data?.playlists as { results?: unknown[] })
      ?.results;

    const items: Array<Record<string, unknown>> = [];
    for (const group of [topQuery, songs, albums, artists]) {
      for (const entry of group ?? []) {
        const item: Record<string, unknown> = {
          ...(entry as Record<string, unknown>),
          source: "jiosaavn",
        };
        if (!item.id && typeof item.videoId === "string") {
          item.id = item.videoId;
        }
        items.push(item);
      }
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
  nextpage: string | undefined,
  config: WorkerConfig
): Promise<SearchResponse> {
  const piped = await searchPiped(query, filter, nextpage, config);
  if (piped.items.length > 0) return piped;

  const invidious = await searchInvidious(query, filter, page, config);
  if (invidious.items.length > 0) return invidious;

  return searchYtify(query, filter, config);
}

async function searchMixed(
  query: string,
  filter: string,
  page: number,
  limit: number,
  config: WorkerConfig
): Promise<SearchResponse> {
  const normalizedFilter = (filter || "all").toLowerCase();
  const youtubeFilter = normalizedFilter === "playlists" ? "playlists" : "all";
  const youtubeMusicFilter =
    normalizedFilter === "playlists" ? "playlists" : "all";
  const soundCloudTasks =
    normalizedFilter === "playlists"
      ? [searchSoundCloud(query, "playlists", page, limit, config)]
      : [
          searchSoundCloud(query, "tracks", page, limit, config),
          searchSoundCloud(
            query,
            "playlists",
            page,
            Math.max(8, limit / 2),
            config
          ),
          searchSoundCloud(
            query,
            "albums",
            page,
            Math.max(8, limit / 2),
            config
          ),
        ];

  const [
    youtubeResult,
    youtubeMusicResult,
    jioSaavnResult,
    ...soundCloudResults
  ] = await Promise.all([
    searchYouTubeDefault(query, youtubeFilter, page, undefined, config),
    searchYouTubeMusic(query, youtubeMusicFilter, undefined, config),
    searchJioSaavn(query, normalizedFilter, config),
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

export async function handleSearch(
  request: Request,
  config: WorkerConfig
): Promise<Response> {
  const searchParams = new URL(request.url).searchParams;
  const q = (searchParams.get("q") || "").trim();
  const sourceParam = (searchParams.get("source") || "mixed").toLowerCase();
  const filterParam = searchParams.get("filter") || "";
  const pageNum = parseInt(searchParams.get("page") || "1", 10) || 1;
  const limitNum = parseInt(searchParams.get("limit") || "20", 10) || 20;
  const nextpage = searchParams.get("nextpage") || undefined;

  if (!q) {
    return json({ items: [], nextpage: null }, { status: 200 });
  }

  try {
    let result: SearchResponse = { items: [], nextpage: null };

    switch (sourceParam) {
      case "mixed":
        result = await searchMixed(q, filterParam, pageNum, limitNum, config);
        break;
      case "piped":
        result = await searchPiped(q, filterParam, nextpage, config);
        break;
      case "youtube":
        result = await searchYouTubeDefault(
          q,
          filterParam,
          pageNum,
          nextpage,
          config
        );
        break;
      case "invidious":
        result = await searchInvidious(q, filterParam, pageNum, config);
        break;
      case "youtubemusic":
        result = await searchYouTubeMusic(q, filterParam, nextpage, config);
        if (result.items.length === 0) {
          result = await searchYtify(q, filterParam, config);
        }
        break;
      case "soundcloud":
        result = await searchSoundCloud(
          q,
          filterParam,
          pageNum,
          limitNum,
          config
        );
        break;
      case "jiosaavn":
        result = await searchJioSaavn(q, filterParam, config);
        break;
      default:
        result = { items: [], nextpage: null };
    }

    return json(
      { items: result.items, nextpage: result.nextpage ?? null },
      { status: 200 }
    );
  } catch {
    return json({ items: [], error: "Search failed" }, { status: 500 });
  }
}
