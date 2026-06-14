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
