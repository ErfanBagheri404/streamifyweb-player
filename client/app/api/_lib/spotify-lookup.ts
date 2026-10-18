// Keyless Spotify lookups shared by the collection and search routes.
//
// The playlist/album embed payload (open.spotify.com/embed/...) carries ONE
// cover for the whole collection and nothing per track, so importing a
// playlist that way paints every row with the same artwork. The same
// keyless persisted-query endpoint the search route uses resolves
// `albumOfTrack` per track URI, which is where real per-track covers come
// from. Kept in _lib so both routes share one token cache instead of each
// minting their own embed token.
const SPOTIFY_PARTNER_BASE = "https://api-partner.spotify.com";
export const SPOTIFY_LOOKUP_OP_HASH =
  "f952da037440f694cc6925b9e3f649d39077a744c4db7dfba01cb883723f4f77";

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

let cachedEmbedToken: { value: string; expiresAt: number } | null = null;

async function getSpotifyEmbedToken(force = false): Promise<string> {
  if (cachedEmbedToken && !force && cachedEmbedToken.expiresAt > Date.now() + 30_000) {
    return cachedEmbedToken.value;
  }

  const response = await fetch("https://open.spotify.com/embed/api/token", {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Spotify embed token HTTP ${response.status}`);

  const payload = toRecord(await response.json());
  const accessToken = typeof payload.accessToken === "string" ? payload.accessToken : "";
  if (!accessToken) throw new Error("Spotify embed token missing accessToken");

  const expiresIn = toNumber(payload.expiresAt) || 3600;
  cachedEmbedToken = {
    value: accessToken,
    expiresAt:
      expiresIn > 10_000_000_000 ? expiresIn : Date.now() + expiresIn * 1000,
  };
  return accessToken;
}

export async function spotifyPartnerQuery(
  variables: Record<string, unknown>,
  hash: string,
): Promise<Record<string, unknown>> {
  for (const force of [false, true]) {
    const token = await getSpotifyEmbedToken(force);
    const response = await fetch(`${SPOTIFY_PARTNER_BASE}/pathfinder/v1/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://open.spotify.com",
        Referer: "https://open.spotify.com/",
      },
      body: JSON.stringify({
        variables,
        extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (response.status === 401 && !force) continue;
    if (!response.ok) throw new Error(`Spotify lookup HTTP ${response.status}`);
    return toRecord(await response.json());
  }
  throw new Error("Spotify lookup HTTP 401");
}

export function pickSpotifyLookupCover(album: Record<string, unknown>): string {
  let best = "";
  let bestSize = 0;
  for (const raw of toArray(toRecord(album.coverArt).sources)) {
    const source = toRecord(raw);
    const url = typeof source.url === "string" ? source.url : "";
    const width = toNumber(source.width) || 0;
    if (url && width >= bestSize) {
      best = url;
      bestSize = width;
    }
  }
  return best;
}

// Map of track id -> its own album cover. Batched at 50 URIs (the lookup op's
// cap upstream). Throws on total failure; callers fall back to collection art.
export async function fetchSpotifyTrackCovers(
  trackIds: string[],
): Promise<Map<string, string>> {
  const covers = new Map<string, string>();
  for (let index = 0; index < trackIds.length; index += 50) {
    const uris = trackIds
      .slice(index, index + 50)
      .map((trackId) => `spotify:track:${trackId}`);
    const lookup = await spotifyPartnerQuery({ uris }, SPOTIFY_LOOKUP_OP_HASH);
    for (const raw of toArray(toRecord(lookup.data).lookupEntities)) {
      const item = toRecord(raw);
      const trackId = safeLastSegment(safeString(item.uri));
      if (!trackId) continue;
      const album = toRecord(
        toRecord(toRecord(item.typedEntity).data).albumOfTrack,
      );
      const cover = pickSpotifyLookupCover(album);
      if (cover) covers.set(trackId, cover);
    }
  }
  return covers;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeLastSegment(uri: string): string {
  return uri.split(":").pop() || "";
}
