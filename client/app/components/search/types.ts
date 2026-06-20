export type SourceType =
  | "mixed"
  | "youtube"
  | "youtubemusic"
  | "soundcloud"
  | "spotify"
  | "jiosaavn";

export interface AuthorThumbnail {
  url: string;
  width: number;
  height: number;
}

export interface SearchResult {
  id: string;
  title: string;
  author?: string;
  authorId?: string;
  duration: string;
  views?: string;
  thumbnailUrl?: string;
  img?: string;
  thumbnail?: string;
  source?: string;
  type?: string;
  playlistId?: string;
  albumId?: string;
  albumName?: string;
  uploaded?: string;
  href?: string;
  videoCount?: number;
  channelDescription?: string;
  verified?: boolean;
  subCount?: number | string;
  authorThumbnails?: AuthorThumbnail[];
  uploaderAvatar?: string;
  uploaderUrl?: string;
  url?: string;
  permalink_url?: string;
  videos?: Array<{
    title: string;
    videoId?: string;
    id?: string;
    lengthSeconds?: number;
    videoThumbnails?: AuthorThumbnail[];
  }>;
  tracks?: Array<{
    id?: string | number;
    title?: string;
    duration?: number | string;
    artwork_url?: string;
    permalink_url?: string;
    user?: {
      username?: string;
      avatar_url?: string;
    };
  }>;
  // Additional fields for different sources
  name?: string;
}

export interface SourceFilter {
  id: SourceType;
  label: string;
  color: string;
}

export interface FilterOption {
  value: string;
  label: string;
}
