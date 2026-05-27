// app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";

const EXPRESS_API_URL = "http://localhost:3001";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q");
  if (!q) return NextResponse.json({ items: [] });

  // Forward all query parameters to Express
  const url = new URL(`${EXPRESS_API_URL}/search`);
  searchParams.forEach((value, key) => {
    url.searchParams.append(key, value);
  });

  try {
    const res = await fetch(url.toString());
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json({ items: [], error: "Search failed" }, { status: 500 });
  }
}