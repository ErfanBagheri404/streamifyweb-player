import { NextRequest } from "next/server";

/**
 * Discord OAuth2 callback route.
 * Exchanges code via CF Worker (Cloudflare network can reach Discord; local Node.js cannot).
 */

const SESSION_URL = process.env.NEXT_PUBLIC_SESSION_URL ?? "";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error || !code) {
    return new Response(
      buildPage(null, error ?? "No authorization code received."),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  if (!SESSION_URL) {
    return new Response(
      buildPage(null, "NEXT_PUBLIC_SESSION_URL not configured — cannot exchange Discord code."),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  try {
    const redirectUri = `${request.nextUrl.origin}/api/discord/callback`;
    const res = await fetch(`${SESSION_URL}/discord/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: request.nextUrl.origin,
      },
      body: JSON.stringify({ code, redirectUri }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[discord/callback] CF Worker exchange failed:", res.status, body);
      return new Response(
        buildPage(null, `Exchange failed: ${res.status} ${body.slice(0, 200)}`),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const userData = await res.json();
    return new Response(
      buildPage(userData, null),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (err: any) {
    console.error("[discord/callback] error:", err?.message || err);
    return new Response(
      buildPage(null, `Error: ${err?.message || "Unknown error"}`),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

function buildPage(
  user: { id: string; username: string; avatar: string | null } | null,
  error: string | null
): string {
  return `<!DOCTYPE html>
<html>
<head><title>Discord Auth</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #1a1a2e;
    color: #e0e0e0;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    margin: 0;
  }
  .box { text-align: center; padding: 2rem; }
  .box h2 { font-size: 1.1rem; margin-bottom: 0.5rem; }
  .box p { font-size: 0.85rem; color: #888; }
  .success { color: #22c55e; }
  .error { color: #f87171; }
</style>
</head>
<body>
<div class="box">
${error
  ? `<h2 class="error">Authentication Failed</h2><p>${escapeHtml(error)}</p>`
  : `<h2 class="success">Connected</h2><p>Signed in as <strong>${escapeHtml(user!.username)}</strong></p>`
}
</div>
<script>
  (function() {
    var userData = ${user ? JSON.stringify(user) : "null"};
    var error = ${error ? JSON.stringify(error) : "null"};
    if (window.opener) {
      window.opener.postMessage(
        { type: "discord-auth", user: userData, error: error },
        window.location.origin
      );
      setTimeout(function() { window.close(); }, 800);
    }
  })();
</script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
