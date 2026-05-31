import { SearchResponse, SearchResult } from "./types";
import { fetchWithProxy, USER_AGENT } from "./proxy";

const PIPED_INSTANCES = ["https://api.piped.private.coffee"];

type SearchPayload = { items?: unknown[]; nextpage?: string | null };

function extractYouTubeVideoId(value: string): string {
  if (!value) return "";

  const watchMatch = value.match(/[?&]v=([^&]+)/);
  if (watchMatch?.[1]) return watchMatch[1];

  const shortMatch = value.match(/youtu\.be\/([^?]+)/);
  if (shortMatch?.[1]) return shortMatch[1];

  return "";
}

function extractYouTubePlaylistId(value: string): string {
  if (!value) return "";

  const listMatch = value.match(/[?&]list=([^&]+)/);
  if (listMatch?.[1]) return listMatch[1];

  if (/^[A-Za-z0-9_-]{10,}$/.test(value) && !value.includes("/")) {
    return value;
  }

  return "";
}

export async function searchYouTube(
  query: string,
  filter: string,
  _page: number,
  _limit: number,
  nextpage?: string
): Promise<SearchResponse> {
  const filterParam = filter === "" ? "all" : filter;
  const endpoint = nextpage
    ? `/nextpage/search?nextpage=${encodeURIComponent(nextpage)}`
    : `/search?q=${encodeURIComponent(query)}&filter=${encodeURIComponent(
        filterParam
      )}`;

  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetchWithProxy(`${instance}${endpoint}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });

      if (!res.ok) continue;

      const json = (await res.json()) as SearchPayload;
      const items = Array.isArray(json.items) ? json.items : [];

      return {
        items: items.map((item): SearchResult => {
          const entry =
            item && typeof item === "object" && !Array.isArray(item)
              ? ({ ...(item as Record<string, unknown>) } as Record<string, unknown>)
              : {};
          const rawUrl = typeof entry.url === "string" ? entry.url : "";
          const rawType = typeof entry.type === "string" ? entry.type : "";
          const videoId =
            typeof entry.videoId === "string"
              ? entry.videoId
              : extractYouTubeVideoId(rawUrl);
          const playlistId =
            typeof entry.playlistId === "string"
              ? entry.playlistId
              : extractYouTubePlaylistId(rawUrl);

          if (videoId) {
            entry.id = videoId;
            entry.videoId = videoId;
          } else if (playlistId) {
            entry.id = playlistId;
            entry.playlistId = playlistId;
          }

          if (!entry.title && typeof entry.name === "string") {
            entry.title = entry.name;
          }

          if (!entry.author && typeof entry.uploaderName === "string") {
            entry.author = entry.uploaderName;
          }

          if (!entry.href && rawUrl) {
            entry.href = rawUrl.startsWith("http")
              ? rawUrl
              : `https://www.youtube.com${rawUrl}`;
          }

          if (rawType === "stream") {
            entry.type = "video";
          } else if (rawType === "channel") {
            entry.type = "channel";
          }

          return {
            ...entry,
            id: typeof entry.id === "string" ? entry.id : "",
            title: typeof entry.title === "string" ? entry.title : "",
            duration:
              typeof entry.duration === "string"
                ? entry.duration
                : typeof entry.lengthSeconds === "number"
                  ? String(entry.lengthSeconds)
                  : "0",
            source: "youtube",
          } as SearchResult;
        }),
        nextpage: json.nextpage ?? null,
      };
    } catch {
      continue;
    }
  }

  return { items: [], nextpage: null };
}
