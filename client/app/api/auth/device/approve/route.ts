import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { createGrant } from "../../../../lib/device-grant";

// Redirect target is hardcoded: never derived from user input, so no open
// redirect is possible by construction. Any `next` param sent here is ignored.
const DESKTOP_REDIRECT_TARGET = "streamify-desktop://auth";

// PKCE S256 challenge is always base64url(SHA256) = 43 chars. Nonce comes
// from randomNonce (22 chars); state is opaque desktop data, tightly scoped.
const CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/;
const NONCE_RE = /^[A-Za-z0-9\-_]{16,128}$/;
const STATE_RE = /^[A-Za-z0-9\-_.~]{1,256}$/;

// POST /api/auth/device/approve — session-gated grant mint. The human already
// confirmed on GET /auth/desktop; this mints the signed grant and 302s it
// back to the desktop app via the custom protocol.
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const form = await request.formData();
  const challenge = String(form.get("challenge") ?? "");
  const nonce = String(form.get("nonce") ?? "");
  const state = String(form.get("state") ?? "");

  if (
    !CHALLENGE_RE.test(challenge) ||
    !NONCE_RE.test(nonce) ||
    !STATE_RE.test(state)
  ) {
    return NextResponse.json(
      { error: "Invalid device authorization request." },
      { status: 400 }
    );
  }

  let grant: string;
  try {
    grant = createGrant({ sub: user.id, challenge, nonce });
  } catch {
    return NextResponse.json(
      { error: "Could not mint device grant." },
      { status: 500 }
    );
  }

  const target =
    `${DESKTOP_REDIRECT_TARGET}?grant=${encodeURIComponent(grant)}` +
    `&state=${encodeURIComponent(state)}`;
  return NextResponse.redirect(target, 302);
}
