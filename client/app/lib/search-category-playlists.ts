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
    playlistTitle: "Monstercat Best of EDM",
    // youtubePlaylistUrl:
    //   "https://www.youtube.com/playlist?list=PLRBp0Fe2GpgnIh0AiYKh7o7HnYAej-5ph",
    playlistUrl: "https://soundcloud.com/monstercat/sets/instinct",
    source: "soundcloud",
  },
  {
    category: "Heavy Metal",
    imageFileName: "Heavy Metal.jpg",
    playlistTitle: "Heavy Metal Classics",
    // youtubePlaylistUrl:
    //   "https://www.youtube.com/playlist?list=PL6Lt9p1lIRZ311J9ZHuzkR5A3xesae2pk",
    playlistUrl: "https://soundcloud.com/earsplit/sets/heavy-metal",
    source: "soundcloud",
  },
  {
    category: "Hip-Hop",
    imageFileName: "Hip-Hop.jpg",
    playlistTitle: "Hip Hop Hits",
    // youtubePlaylistUrl:
    //   "https://www.youtube.com/playlist?list=PLTDluH66q5mpRzM4z0dY3A1JpN96CB2TF",
    playlistUrl: "https://soundcloud.com/rapcaviar/sets/hip-hop-hits",
    source: "soundcloud",
  },
  {
    category: "Jazz",
    imageFileName: "Jazz.jpg",
    playlistTitle: "Jazz Classics",
    // youtubePlaylistUrl:
    //   "https://www.youtube.com/playlist?list=PL8F6B0753B2CCA128",
    playlistUrl: "https://soundcloud.com/jazzhopcafe/sets/jazzhop-essentials",
    source: "soundcloud",
  },
  {
    category: "K-Pop",
    imageFileName: "K-Pop.jpg",
    playlistTitle: "K-Pop Daebak",
    // youtubePlaylistUrl:
    //   "https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI",
    playlistUrl: "https://soundcloud.com/kpop-playlists/sets/kpop-hits",
    source: "soundcloud",
  },
  {
    category: "LO-FI",
    imageFileName: "LO-FI.jpg",
    playlistTitle: "Lofi Hip Hop Radio Playlist",
    // youtubePlaylistUrl:
    //   "https://www.youtube.com/playlist?list=PLofht4PTcKYnaH8w5olJCI-wUVxuoMHqM",
    playlistUrl: "https://soundcloud.com/chilledcow/sets/lofi-hip-hop",
    source: "soundcloud",
  },
  {
    category: "Metal",
    imageFileName: "Metal.jpg",
    playlistTitle: "Metal Essentials",
    // youtubePlaylistUrl:
    //   "https://www.youtube.com/playlist?list=PLhQCJTkrHOwSXGx8rD6M2JfA8J8kY4i6x",
    playlistUrl: "https://soundcloud.com/earsplit/sets/metal",
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
    playlistTitle: "Persian Music Hits",
    // youtubePlaylistUrl:
    //   "https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj",
    playlistUrl: "https://soundcloud.com/persian-music/sets/persian-hits",
    source: "soundcloud",
  },
  {
    category: "Phonk",
    imageFileName: "Phonk.jpg",
    playlistTitle: "Drift Phonk",
    // youtubePlaylistUrl:
    //   "https://www.youtube.com/playlist?list=PLRBp0Fe2GpglB6wzXn0EfacrDo8jMnSmQ",
    playlistUrl: "https://soundcloud.com/phonk/sets/drift-phonk",
    source: "soundcloud",
  },
  {
    category: "Pop",
    imageFileName: "Pop.jpg",
    playlistTitle: "Today's Top Pop",
    // youtubePlaylistUrl:
    //   "https://www.youtube.com/playlist?list=PL4fGSI1pDJn5rWitrRWFKdm-ulaFiIyoK",
    playlistUrl: "https://soundcloud.com/topsify/sets/pop-hits",
    source: "soundcloud",
  },
  {
    category: "R&B",
    imageFileName: "R&B.jpg",
    playlistTitle: "R&B Essentials",
    // youtubePlaylistUrl:
    //   "https://www.youtube.com/playlist?list=PL4fGSI1pDJn6dM4n4Xv3AWEzhFawwzrtc",
    playlistUrl: "https://soundcloud.com/rnb/sets/rnb-essentials",
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
