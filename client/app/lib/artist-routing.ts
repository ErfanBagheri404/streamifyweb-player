export type ArtistRouteDescriptor = {
  artistId?: string;
  source?: string;
};

function normalizeArtistSource(source?: string): string {
  return source?.trim().toLowerCase() || "youtube";
}

export function canOpenArtistRoute(artist: ArtistRouteDescriptor): boolean {
  const artistId = artist.artistId?.trim();
  if (!artistId) return false;

  const source = normalizeArtistSource(artist.source);
  return (
    source === "youtube" ||
    source === "youtubemusic" ||
    source === "jiosaavn"
  );
}

export function buildArtistRouteHref(
  artist: ArtistRouteDescriptor
): string | null {
  const artistId = artist.artistId?.trim();
  if (!artistId || !canOpenArtistRoute(artist)) return null;

  const source = normalizeArtistSource(artist.source);
  if (source === "youtube") {
    return `/artist/${encodeURIComponent(artistId)}`;
  }

  const params = new URLSearchParams({ source });
  return `/artist/${encodeURIComponent(artistId)}?${params.toString()}`;
}
