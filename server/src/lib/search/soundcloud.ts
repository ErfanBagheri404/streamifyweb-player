import { SearchResponse, SearchResult } from "./types";
import { fetchWithProxy, USER_AGENT } from "./proxy";

function upgradeSoundCloudImage(url?: string): string {
  if (!url) return "";

  return url
    .replace("-large.", "-t500x500.")
    .replace("large.jpg", "t500x500.jpg")
    .replace("large.png", "t500x500.png");
}

export async function searchSoundCloud(
  query: string,
  filter: string,
  page: number,
  limit: number
): Promise<SearchResponse> {
  const normalizeTrackDuration = (value: unknown): string => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value > 10000 ? Math.floor(value / 1000) : Math.floor(value));
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return String(
          parsed > 10000 ? Math.floor(parsed / 1000) : Math.floor(parsed)
        );
      }
    }
    return "0";
  };

  const normalizeTrackItem = (input: Record<string, unknown>): SearchResult => {
    const user =
      input.user && typeof input.user === "object"
        ? (input.user as Record<string, unknown>)
        : {};

    return {
      ...input,
      id: String(input.id || input.permalink_url || input.url || ""),
      title: typeof input.title === "string" ? input.title : "",
      author:
        (typeof user.username === "string" ? user.username : undefined) ||
        (typeof input.author === "string" ? input.author : undefined) ||
        "Unknown Artist",
      thumbnailUrl: upgradeSoundCloudImage(
        (typeof input.artwork_url === "string" ? input.artwork_url : "") ||
          (typeof input.thumbnailUrl === "string" ? input.thumbnailUrl : "") ||
          (typeof input.thumbnail === "string" ? input.thumbnail : "") ||
          (typeof user.avatar_url === "string" ? user.avatar_url : "")
      ),
      url:
        (typeof input.permalink_url === "string" ? input.permalink_url : "") ||
        (typeof input.permalinkUrl === "string" ? input.permalinkUrl : "") ||
        (typeof input.url === "string" ? input.url : "") ||
        (typeof input.href === "string" ? input.href : ""),
      duration: normalizeTrackDuration(input.duration),
      source: "soundcloud",
      type: "song",
    } as SearchResult;
  };

  const f = (filter || "").toLowerCase();
  const offset = (page - 1) * limit;

  try {
    if (f === "playlists" || f === "albums") {
      const beatseekUrl = `https://beatseek.io/api/search?query=${encodeURIComponent(
        query
      )}&platform=soundcloud&type=${encodeURIComponent(
        f
      )}&sort=both&limit=${limit}`;
      const res = await fetchWithProxy(beatseekUrl, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });

      if (!res.ok) return { items: [], nextpage: null };

      const json = (await res.json()) as { results?: unknown[] };
      const results = Array.isArray(json.results) ? json.results : [];
      const pagedResults = results.slice(offset, offset + limit);

      return {
        items: pagedResults.map((entry) => {
          const record =
            entry && typeof entry === "object" && !Array.isArray(entry)
              ? (entry as Record<string, unknown>)
              : {};
          const artwork = upgradeSoundCloudImage(
            typeof record.artworkUrl === "string" ? record.artworkUrl : ""
          );

          return {
            ...record,
            id: String(record.id || record.url || ""),
            url: typeof record.url === "string" ? record.url : "",
            href: typeof record.url === "string" ? record.url : "",
            title: typeof record.title === "string" ? record.title : "",
            author: typeof record.artist === "string" ? record.artist : "",
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
          } satisfies SearchResult;
        }),
        nextpage: null,
      };
    }

    const proxyUrl = `https://proxy.searchsoundcloud.com/tracks?q=${encodeURIComponent(
      query
    )}&limit=${limit}&offset=${offset}`;

    const res = await fetchWithProxy(proxyUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });

    if (!res.ok) return { items: [], nextpage: null };

    const json = (await res.json()) as {
      collection?: unknown[];
      results?: unknown[];
    };
    const collection = json.collection ?? json.results ?? [];

    return {
      items: collection.map((entry) =>
        normalizeTrackItem((entry as Record<string, unknown>) || {})
      ),
      nextpage: null,
    };
  } catch {
    return { items: [], nextpage: null };
  }
}
