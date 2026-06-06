import { NextRequest, NextResponse } from "next/server";

function isSameOriginUrl(candidate: string | null, expectedOrigin: string) {
  if (!candidate) return false;

  try {
    return new URL(candidate).origin === expectedOrigin;
  } catch {
    return false;
  }
}

export function requireStreamifyRequest(
  request: NextRequest
): NextResponse | null {
  if (process.env.NODE_ENV === "development") {
    return null;
  }

  const expectedOrigin = request.nextUrl.origin;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const secFetchSite = (request.headers.get("sec-fetch-site") || "").toLowerCase();

  if (isSameOriginUrl(origin, expectedOrigin)) {
    return null;
  }

  if (isSameOriginUrl(referer, expectedOrigin)) {
    return null;
  }

  if (secFetchSite === "same-origin") {
    return null;
  }

  return NextResponse.json(
    { error: "This API is only available from Streamify." },
    { status: 403 }
  );
}
