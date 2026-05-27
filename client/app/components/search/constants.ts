import { SourceFilter, FilterOption, SourceType } from "./types";

export const sourceFilters: SourceFilter[] = [
  { id: "youtube", label: "YouTube", color: "#ff0000" },
  { id: "youtubemusic", label: "YouTube Music", color: "#ff0000" },
  { id: "soundcloud", label: "SoundCloud", color: "#ff7700" },
  { id: "jiosaavn", label: "JioSaavn", color: "#1fa18a" },
  { id: "spotify", label: "Spotify", color: "#1db954" },
];

export const searchFilters: FilterOption[] = [
  { value: "", label: "All" },
  { value: "videos", label: "Videos" },
  { value: "channels", label: "Channels" },
  { value: "playlists", label: "Playlists" },
];

export const youtubeMusicFilters: FilterOption[] = [
  { value: "songs", label: "Songs" },
  { value: "videos", label: "Videos" },
  { value: "albums", label: "Albums" },
  { value: "playlists", label: "Playlists" },
  { value: "channels", label: "Artists" },
];

export const soundCloudFilters: FilterOption[] = [
  { value: "tracks", label: "Tracks" },
  { value: "playlists", label: "Playlists" },
  { value: "albums", label: "Albums" },
];

export const jioSaavnFilters: FilterOption[] = [
  { value: "", label: "All" },
  { value: "songs", label: "Songs" },
  { value: "albums", label: "Albums" },
  { value: "artists", label: "Artists" },
];

export function getFilterOptions(source: SourceType): FilterOption[] {
  switch (source) {
    case "youtube":
      return [
        { label: "All", value: "all" },
        { label: "Videos", value: "videos" },
        { label: "Channels", value: "channels" },
        { label: "Playlists", value: "playlists" },
      ];
    case "youtubemusic":
      return [
        { label: "Songs", value: "songs" },
        { label: "Videos", value: "videos" },
        { label: "Albums", value: "albums" },
        { label: "Playlists", value: "playlists" },
        { label: "Artists", value: "channels" },
      ];
    case "soundcloud":
      return [
        { label: "Tracks", value: "tracks" },
        { label: "Playlists", value: "playlists" },
        { label: "Albums", value: "albums" },
      ];
    default:
      return [];
  }
}