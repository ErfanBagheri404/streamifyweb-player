import { SearchResponse, SearchResult } from "./types";
import { fetchWithProxy, USER_AGENT } from "./proxy";

const PIPED_INSTANCES = ["https://api.piped.private.coffee"];

interface PipedVideo {
  type: "video";
  title: string;
  videoId: string;
  author: string;
  authorId: string;
  authorUrl: string;
  videoThumbnails: { quality: string; url: string; width: number; height: number }[];
  viewCount: number;
  lengthSeconds: number;
  publishedText: string;
}
interface PipedPlaylist {
  type: "playlist";
  title: string;
  playlistId: string;
  playlistThumbnail: string;
  author: string;
  authorId: string;
  authorUrl: string;
  videoCount: number;
  videos: { title: string; videoId: string; lengthSeconds: number; videoThumbnails: { quality: string; url: string; width: number; height: number }[] }[];
}
interface PipedChannel {
  type: "channel";
  author: string;
  authorId: string;
  authorUrl: string;
  authorThumbnails: { url: string; width: number; height: number }[];
  authorVerified?: boolean;
  subCount: number;
  videoCount: number;
  description: string;
  descriptionHtml: string;
}
// Add hashtag interface – it was missing!
interface PipedHashtag {
  type: "hashtag";
  title: string;
  url: string;
  channelCount: number;
  videoCount: number;
}

type PipedResult = PipedVideo | PipedPlaylist | PipedChannel | PipedHashtag;

interface PipedSearchResponse {
  items: PipedResult[];
  nextpage?: string;
}

async function fetchFromPiped(
  endpoint: string
): Promise<PipedSearchResponse | null> {
  for (const baseUrl of PIPED_INSTANCES) {
    try {
      const url = `${baseUrl}${endpoint}`;
      console.log(`Trying: ${url}`);
      const res = await fetchWithProxy(url, {
        headers: { "User-Agent": USER_AGENT },
      });
      console.log(`Status: ${res.status}`);
      if (res.ok) {
        const json: unknown = await res.json();
        // Use proper cast – avoids “any” and unused warning
        const piped = json as PipedSearchResponse;
        console.log(`Received ${piped.items?.length || 0} items`);
        return piped;
      } else {
        console.error(`Non-OK response: ${res.status}`, await res.text());
      }
    } catch (err) {
      console.error(`Fetch failed for ${baseUrl}:`, err);
      continue;
    }
  }
  return null;
}

export async function searchYouTube(
  query: string,
  filter: string,
  _page: number,
  _limit: number,
  nextpage?: string
): Promise<SearchResponse> {
  const filterParam = filter === "" ? "all" : filter;
  let endpoint = "";
  if (nextpage) {
    endpoint = `/nextpage/search?nextpage=${encodeURIComponent(nextpage)}`;
  } else {
    endpoint = `/search?q=${encodeURIComponent(query)}&filter=${filterParam}`;
  }
  console.log(`Piped endpoint: ${endpoint}`);

  const data = await fetchFromPiped(endpoint);
  const items: PipedResult[] = data?.items ?? [];
  const newNextpage: string | null = data?.nextpage ?? null;

  const results: SearchResult[] = [];
  for (const item of items) {
    const base = { source: "youtube" as const };
    switch (item.type) {
      case "video":
        results.push({
          ...base,
          id: item.videoId,
          title: item.title,
          author: item.author,
          duration: item.lengthSeconds.toString(),
          views: item.viewCount.toString(),
          thumbnailUrl: item.videoThumbnails?.[0]?.url || "",
          href: `https://www.youtube.com/watch?v=${item.videoId}`,
          type: "video",
        });
        break;
      case "playlist":
        results.push({
          ...base,
          id: item.playlistId,
          title: item.title,
          author: item.author,
          thumbnailUrl: item.playlistThumbnail || "",
          videoCount: item.videoCount,
          href: `https://www.youtube.com/playlist?list=${item.playlistId}`,
          videos: item.videos,
          type: "playlist",
          duration: "0",
        });
        break;
      case "channel":
        results.push({
          ...base,
          id: item.authorId,
          title: item.author,
          author: item.author,
          thumbnailUrl: item.authorThumbnails?.[0]?.url || "",
          videoCount: item.videoCount,
          channelDescription: item.description,
          verified: !!item.authorVerified,
          href: item.authorUrl,
          subCount: item.subCount,
          type: "channel",
          duration: "0",
        });
        break;
      case "hashtag":
        results.push({
          ...base,
          id: item.title,               // use title as id
          title: item.title,
          author: "",
          thumbnailUrl: "",
          type: "hashtag",
          duration: "0",
        });
        break;
    }
  }

  return { items: results, nextpage: newNextpage };
}
