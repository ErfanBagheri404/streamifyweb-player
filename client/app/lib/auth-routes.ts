const AUTH_PAGE_PREFIXES = [
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
] as const;

export function isStandaloneAuthPath(pathname: string | null | undefined) {
  if (!pathname) return false;

  return AUTH_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// Validated `?next=` redirect target. Same-origin paths only: must start with
// a single "/" (rejects "//evil", "/\evil", absolute URLs, backslashes).
// Anything else falls back, so open redirects are impossible by construction.
export function getSafeNextPath(
  value: string | null | undefined,
  fallback = "/settings"
): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (/[\r\n\\]/.test(value)) return fallback;
  return value;
}
