import { SearchResponse } from "./types";
import { searchYouTube } from "./youtube";

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

export async function searchYouTubeMusic(
  query: string,
  filter: string,
  page: number = 1,
  limit: number = 20,
  nextpage?: string
): Promise<SearchResponse> {
  const musicFilter = musicFilterMap(filter || "songs");
  const result = await searchYouTube(query, musicFilter, page, limit, nextpage);

  return {
    items: result.items.map((item) => ({ ...item, source: "youtubemusic" })),
    nextpage: result.nextpage ?? null,
  };
}
