export type SearchCategoryPlaylist = {
  category: string;
  imageFileName: string;
  playlistTitle: string;
  playlistUrl?: string;
  playlistId?: string;
  source?: "youtube" | "youtubemusic" | "soundcloud";
};

export const SEARCH_CATEGORY_PLAYLISTS: SearchCategoryPlaylist[] = [
  {
    category: "Alternative",
    imageFileName: "Alternative.jpg",
    playlistTitle: "Greatest Alternative Rock Songs of All Time",
    // youtubePlaylistUrl:
    //   "https://www.youtube.com/playlist?list=PL9tY0BWXOZFv4N0w0R6Vrn956xWxBY2NU",
    playlistUrl:
      "https://soundcloud.com/storemusic-974485696/sets/top-alternative-rock-songs-the",
    source: "soundcloud",
  },
  {
    category: "Electronic",
    imageFileName: "Electronic.jpg",
    playlistTitle: "Lounge Music Mix - Electronic",
    playlistUrl: "https://soundcloud.com/profimedia/sets/lounge-music-mix-electronic",
    source: "soundcloud",
  },
  {
    category: "Heavy Metal",
    imageFileName: "Heavy Metal.jpg",
    playlistTitle: "Heavy Metal Workout",
    playlistUrl: "https://soundcloud.com/sc-playlists-eunon/sets/heavy-metal-workout",
    source: "soundcloud",
  },
  {
    category: "Hip-Hop",
    imageFileName: "Hip-Hop.jpg",
    playlistTitle: "Top 100 Hip Hop Hits Of All Time",
    playlistUrl: "https://soundcloud.com/butterworthzak/sets/top-100-hip-hop-hits-of-all",
    source: "soundcloud",
  },
  {
    category: "Jazz",
    imageFileName: "Jazz.jpg",
    playlistTitle: "Coffee Jazz",
    playlistUrl: "https://soundcloud.com/relaxcafemusic/sets/coffee-jazz",
    source: "soundcloud",
  },
  {
    category: "K-Pop",
    imageFileName: "K-Pop.jpg",
    playlistTitle: "Best KPop 2026 Playlist",
    playlistUrl: "https://soundcloud.com/storemusic-974485696/sets/best-kpop-2024-playlist-top",
    source: "soundcloud",
  },
  {
    category: "LO-FI",
    imageFileName: "LO-FI.jpg",
    playlistTitle: "Chill Beats - Lofi Jazz Hop",
    playlistUrl: "https://soundcloud.com/chill-bill-16/sets/chill-beats-lofi-jazz-hop-lo",
    source: "soundcloud",
  },
  {
    category: "Metal",
    imageFileName: "Metal.jpg",
    playlistTitle: "Rock & Metal Classics",
    playlistUrl: "https://soundcloud.com/user-423177428-224399444/sets/rock-metal-classics-ii",
    source: "soundcloud",
  },
  {
    category: "OST",
    imageFileName: "OST.jpg",
    playlistTitle: "Best Video Game Music",
    // youtubePlaylistUrl:
    //   "https://www.youtube.com/playlist?list=PLYe6T-dUgqOM5DpuzJXTdT8_7BM9dgmSr",
    playlistUrl: "https://soundcloud.com/rage-remix/sets/game-soundtracks",
    source: "soundcloud",
  },
  {
    category: "Persian",
    imageFileName: "Persian.jpg",
    playlistTitle: "Persian Pop - Top Iranian Hits",
    playlistUrl: "https://soundcloud.com/max-alaga/sets/persian-pop-2026-top-iranian",
    source: "soundcloud",
  },
  {
    category: "Phonk",
    imageFileName: "Phonk.jpg",
    playlistTitle: "Aggressive Phonk",
    playlistUrl: "https://soundcloud.com/b3nde/sets/agressive-phonk",
    source: "soundcloud",
  },
  {
    category: "Pop",
    imageFileName: "Pop.jpg",
    playlistTitle: "Today's Top Music Hits 2025",
    playlistUrl: "https://soundcloud.com/21charts/sets/todays-top-music-hits-2025",
    source: "soundcloud",
  },
  {
    category: "R&B",
    imageFileName: "R&B.jpg",
    playlistTitle: "R&B Classics 90s & 2000s",
    playlistUrl: "https://soundcloud.com/sam-derbyshire-498361112/sets/r-b-classics-90s-2000s-best",
    source: "soundcloud",
  },
  {
    category: "Rock",
    imageFileName: "Rock.jpg",
    playlistTitle: "Classic Rock Greatest Hits",
    // youtubePlaylistUrl:
    //   "https://www.youtube.com/playlist?list=PLGBuKfnErZlA4t4wU4z0LxN9QjA36TObg",
    playlistUrl:
      "https://soundcloud.com/storemusic-974485696/sets/alternative-rock-playlist",
    source: "soundcloud",
  },
  {
    category: "Synthwave",
    imageFileName: "Synthwave.jpg",
    playlistTitle: "Synthwave & Retrowave",
    // youtubePlaylistUrl:
    //   "https://www.youtube.com/playlist?list=PLB4GgM6H7K8f4y4V3K6xY6I9z3lQ4W7mP",
    playlistUrl:
      "https://soundcloud.com/theociderecords/sets/best-of-synthwave",
    source: "soundcloud",
  },
];

export function extractYouTubePlaylistId(value?: string): string {
  if (!value) return "";

  const listMatch = value.match(/[?&]list=([^&]+)/);
  if (listMatch?.[1]) return listMatch[1];

  if (/^[A-Za-z0-9_-]{10,}$/.test(value.trim()) && !value.includes("/")) {
    return value.trim();
  }

  return "";
}

export function getSearchCategoryPlaylistId(
  playlist: SearchCategoryPlaylist
): string {
  const source = playlist.source || "youtube";
  if (source === "soundcloud") {
    return playlist.playlistId?.trim() || playlist.playlistUrl?.trim() || "";
  }

  return (
    playlist.playlistId?.trim() ||
    extractYouTubePlaylistId(playlist.playlistUrl) ||
    ""
  );
}

export function getSearchCategoryPlaylistHref(
  playlist: SearchCategoryPlaylist
): string | null {
  const playlistId = getSearchCategoryPlaylistId(playlist);
  if (!playlistId) return null;

  const params = new URLSearchParams();
  const source = playlist.source || "youtube";
  params.set("source", source);
  if (
    source !== "youtube" &&
    source !== "youtubemusic" &&
    playlist.playlistUrl?.trim()
  ) {
    params.set("url", playlist.playlistUrl.trim());
  }

  return `/collection/playlist/${encodeURIComponent(
    playlistId
  )}?${params.toString()}`;
}
