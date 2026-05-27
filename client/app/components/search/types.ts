export type SourceType =
  | "youtube"
  | "youtubemusic"
  | "soundcloud"
  | "spotify"
  | "jiosaavn";

export interface SearchResult {
  id: string;
  title: string;
  author?: string;
  duration: string;
  views?: string;
  thumbnailUrl?: string;
  img?: string;
  source?: string;
  type?: string;
  albumId?: string;
  albumName?: string;
  uploaded?: string;
  href?: string;
  videoCount?: number;
  channelDescription?: string;
  verified?: boolean;
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