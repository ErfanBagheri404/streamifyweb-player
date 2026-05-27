import { NextRequest, NextResponse } from "next/server";

function getBackendBaseUrl(): string | null {
  const fromEnv =
    process.env.EXPRESS_API_URL ||
    process.env.SEARCH_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL;

  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "development") return "http://localhost:3001";
  return null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q");
  if (!q) return NextResponse.json({ items: [] });

  const backendBaseUrl = getBackendBaseUrl();
  if (!backendBaseUrl) {
    return NextResponse.json(
      {
        items: [],
        error:
          "Backend API URL is not configured. Set EXPRESS_API_URL (recommended) or SEARCH_API_BASE_URL.",
      },
      { status: 500 }
    );
  }

  const url = new URL(`${backendBaseUrl}/search`);
  searchParams.forEach((value, key) => {
    url.searchParams.append(key, value);
  });

  try {
    const res = await fetch(url.toString(), {
      headers: {
        accept: "application/json",
      },
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { items: [], error: "Search failed" },
      { status: 500 }
    );
  }
}

