import { NextRequest, NextResponse } from "next/server";
import { verifyChallenge, verifyGrant } from "../../../../lib/device-grant";

// ponytail: jti burn list is in-memory per server instance. On a multi-instance
// deploy a replay could land on another instance — key jti in Redis/KV if scaled out.
const burnedJtis = new Map<string, number>();

// Single-use: returns false if this jti was already redeemed. Expired entries
// are swept on each call so the map cannot grow without bound.
function burnJti(jti: string, expSeconds: number): boolean {
  const now = Date.now();
  for (const [key, exp] of burnedJtis) {
    if (exp * 1000 < now) burnedJtis.delete(key);
  }
  if (burnedJtis.has(jti)) return false;
  burnedJtis.set(jti, expSeconds);
  return true;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// POST /api/auth/device/token — redeems a grant + PKCE verifier for a
// magic-link token_hash, which the desktop renderer exchanges for a session
// via verifyOtp. Needs no session: the signed grant + verifier ARE the auth.
export async function POST(request: NextRequest) {
  let body: { grant?: unknown; verifier?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const grant = readString(body.grant);
  const verifier = readString(body.verifier);
  if (!grant || !verifier || verifier.length > 512) {
    return NextResponse.json(
      { error: "grant and verifier are required." },
      { status: 400 }
    );
  }

  const verification = verifyGrant(grant);
  if (!verification.ok || !verification.payload) {
    return NextResponse.json({ error: "Invalid grant." }, { status: 401 });
  }
  const payload = verification.payload;

  if (!verifyChallenge(verifier, payload.challenge)) {
    return NextResponse.json(
      { error: "Verifier does not match grant challenge." },
      { status: 401 }
    );
  }

  if (!burnJti(payload.jti, payload.exp)) {
    return NextResponse.json(
      { error: "Grant already redeemed." },
      { status: 409 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Device login is unavailable until SUPABASE_SERVICE_ROLE_KEY is configured." },
      { status: 503 }
    );
  }

  const adminHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  // sub -> email, so generateLink can mint the magic link.
  const userResponse = await fetch(
    `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(payload.sub)}`,
    { headers: adminHeaders, cache: "no-store" }
  );
  if (!userResponse.ok) {
    return NextResponse.json(
      { error: "Could not resolve grant user." },
      { status: 502 }
    );
  }
  const userPayload = (await userResponse.json()) as {
    user?: { email?: string | null };
    email?: string | null;
  };
  const email =
    userPayload.user?.email?.trim() || userPayload.email?.trim() || "";
  if (!email) {
    return NextResponse.json(
      { error: "Grant user has no email address." },
      { status: 502 }
    );
  }

  const linkResponse = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!linkResponse.ok) {
    return NextResponse.json(
      { error: "Could not mint device session token." },
      { status: 502 }
    );
  }
  const linkPayload = (await linkResponse.json()) as {
    hashed_token?: string | null;
  };
  if (!linkPayload.hashed_token) {
    return NextResponse.json(
      { error: "Auth server did not return a token hash." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    token_hash: linkPayload.hashed_token,
    email,
    nonce: payload.nonce,
  });
}
