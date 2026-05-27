import { SearchResponse, SearchResult } from "./types";
import { fetchWithProxy, USER_AGENT } from "./proxy";

interface JioSaavnImage {
  quality: string;
  url: string;
}
interface JioSaavnSong {
  id: string;
  song?: string;
  name?: string;
  singers?: string;
  primaryArtists?: string;
  duration?: string;
  image?: JioSaavnImage[];
  album?: { id: string; name: string; url: string };
}
interface JioSaavnAlbum {
  id: string;
  title: string;
  artist?: string;
  year?: string;
  image?: JioSaavnImage[];
}
interface JioSaavnArtist {
  id: string;
  title: string;
  description?: string;
  image?: JioSaavnImage[];
}
interface JioSaavnResultSet {
  results?: JioSaavnSong[] | JioSaavnAlbum[] | JioSaavnArtist[] | unknown[];
}
interface JioSaavnSearchData {
  topQuery?: { results?: unknown[] };
  songs?: JioSaavnResultSet;
  albums?: JioSaavnResultSet;
  artists?: JioSaavnResultSet;
}
interface JioSaavnSearchResponse {
  success: boolean;
  data?: JioSaavnSearchData;
}

export async function searchJioSaavn(query: string): Promise<SearchResponse> {
  try {
    const url = `https://streamifyjiosaavn.vercel.app/api/search?query=${encodeURIComponent(query)}`;
    const res = await fetchWithProxy(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    const json: unknown = await res.json();
    const data = json as JioSaavnSearchResponse;

    if (!data || !data.success) return { items: [], nextpage: null };

    const topQuery: unknown[] = (data.data?.topQuery?.results as unknown[]) ?? [];
    const songs: JioSaavnSong[] = (data.data?.songs?.results as JioSaavnSong[]) ?? [];
    const albums: JioSaavnAlbum[] = (data.data?.albums?.results as JioSaavnAlbum[]) ?? [];
    const artists: JioSaavnArtist[] = (data.data?.artists?.results as JioSaavnArtist[]) ?? [];

    const results: SearchResult[] = [];

    for (const item of topQuery) {
      const obj = item as { id?: string; title?: string; description?: string; image?: JioSaavnImage[] };
      const thumb = obj.image?.find((img) => img.quality === "500x500")?.url || obj.image?.[0]?.url;
      results.push({
        id: String(obj.id),
        title: obj.title || "",
        author: obj.description || "",
        thumbnailUrl: thumb,
        type: "unknown",
        source: "jiosaavn",
        duration: "",
      });
    }

    for (const s of songs) {
      const thumb = s.image?.find((img) => img.quality === "500x500")?.url || s.image?.[0]?.url;
      results.push({
        id: String(s.id),
        title: s.song || s.name || "",
        author: s.singers || s.primaryArtists || "",
        duration: s.duration ? String(s.duration) : "0",
        thumbnailUrl: thumb,
        type: "song",
        source: "jiosaavn",
        albumId: s.album?.id,
        albumName: s.album?.name,
      });
    }

    for (const alb of albums) {
      const thumb = alb.image?.find((img) => img.quality === "500x500")?.url || alb.image?.[0]?.url;
      results.push({
        id: String(alb.id),
        title: alb.title,
        author: alb.artist || "",
        thumbnailUrl: thumb,
        type: "album",
        source: "jiosaavn",
        duration: "",
        uploaded: alb.year,
      });
    }

    for (const art of artists) {
      const thumb = art.image?.find((img) => img.quality === "500x500")?.url || art.image?.[0]?.url;
      results.push({
        id: String(art.id),
        title: art.title,
        author: art.description || "",
        thumbnailUrl: thumb,
        type: "artist",
        source: "jiosaavn",
        duration: "",
      });
    }

    return { items: results, nextpage: null };
  } catch {
    return { items: [], nextpage: null };
  }
}