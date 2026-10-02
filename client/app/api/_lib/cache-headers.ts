/**
 * Shared Cache-Control headers for public JSON API routes.
 *
 * These routes return catalog data that is identical for every caller (no
 * per-user/auth content), so letting Vercel's CDN answer repeat requests keeps
 * the serverless function off the hot path — fewer invocations, less CPU.
 *
 * Only apply to success responses of public reads. Never apply to routes that
 * return per-user data or short-lived signed URLs (e.g. /api/video, whose
 * audioUrl expires and must not be shared from a cache).
 */
export function publicJsonCacheHeaders(
  maxAgeSeconds: number,
  staleWhileRevalidateSeconds = maxAgeSeconds * 5
): Record<string, string> {
  return {
    "Cache-Control": `public, s-maxage=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`,
    // The same-origin request guard returns 403 for cross-origin callers.
    // Without Vary the CDN could cache that 403 and serve it to a same-origin
    // user, so key the cache on the headers the guard inspects.
    "Vary": "Origin, Referer, Sec-Fetch-Site",
  };
}
