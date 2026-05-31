import { SearchResponse, SearchResult } from "./types";
import { fetchWithProxy, USER_AGENT } from "./proxy";

interface SoundCloudTrackResponse {
  collection: SoundCloudTrack[];
}
interface SoundCloudTrack {
  kind: string;
  id: number;
  title: string;
  duration: number;
  playback_count: number;
  created_at: string;
  permalink_url: string;
  artwork_url?: string;
  user: { username: string; avatar_url: string };
}

interface SoundCloudCollectionItem {
  permalink_url?: string;
  url?: string;
  title: string;
  name?: string;
  user?: { username: string; avatar_url: string };
  artist?: string;
  author?: string;
  track_count?: number;
  tracks?: unknown[];
  artwork_url?: string;
  artwork?: string;
  avatar_url?: string;
}
interface SoundCloudCollectionResponse {
  collection?: SoundCloudCollectionItem[];
  results?: SoundCloudCollectionItem[];
}

export async function searchSoundCloud(
  query: string,
  filter: string,
  page: number,
  limit: number
): Promise<SearchResponse> {
  const f = (filter || "").toLowerCase();
  const offset = (page - 1) * limit;

  if (f === "playlists" || f === "albums") {
    const scType = f === "playlists" ? "playlists" : "albums";
    const url = `https://proxy.searchsoundcloud.com/${scType}?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`;
    const res = await fetchWithProxy(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (!res.ok) return { items: [], nextpage: null };
    const json: unknown = await res.json();
    const data = json as SoundCloudCollectionResponse;
    const collection = data?.collection ?? data?.results ?? [];
    const items: SearchResult[] = collection.map((c) => ({
      id: c.permalink_url || c.url || "",
      title: c.title || c.name || "",
      author: c.user?.username || c.artist || c.author || "",
      href: c.permalink_url || c.url || "",
      url: c.permalink_url || c.url || "",
      videoCount: c.track_count ?? (Array.isArray(c.tracks) ? c.tracks.length : undefined),
      tracks: Array.isArray(c.tracks) ? c.tracks : undefined,
      thumbnailUrl: c.artwork_url || c.artwork || c.user?.avatar_url || "",
      type: scType === "playlists" ? "playlist" : "album",
      source: "soundcloud",
      duration: "", // not needed for playlists/albums
    }));
    return { items, nextpage: null };
  } else {
    // tracks
    const url = `https://proxy.searchsoundcloud.com/tracks?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`;
    const res = await fetchWithProxy(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (!res.ok) return { items: [], nextpage: null };
    const json: unknown = await res.json();
    const data = json as SoundCloudTrackResponse;
    const tracks = data?.collection ?? [];
    const items: SearchResult[] = tracks
      .filter((t) => t.kind === "track" && t.duration >= 10000)
      .map((t) => ({
        id: String(t.id),
        title: t.title,
        author: t.user?.username,
        duration: String(Math.floor(t.duration / 1000)),
        views: String(t.playback_count || 0),
        uploaded: "",
        href: t.permalink_url,
        url: t.permalink_url,
        thumbnailUrl: t.artwork_url?.replace("large.jpg", "t500x500.jpg") || t.user?.avatar_url,
        type: "song",
        source: "soundcloud",
      }));
    return { items, nextpage: null };
  }
}
