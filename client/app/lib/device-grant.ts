import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Stateless device-grant tokens for the desktop auth handoff.
//
// A grant is a signed, short-lived, single-use authorization to mint a session
// for the desktop app. It is NOT a session token: it cannot be exchanged for a
// session without the PKCE verifier that only the desktop process knows.
//
// Payload: { sub, aud, exp, jti, nonce, challenge }
//   sub       - user id (from the webplayer session)
//   aud       - "streamify-desktop"
//   exp       - seconds since epoch
//   jti       - unique id, burned on redeem
//   nonce     - echoed through the browser, checked on return
//   challenge - base64url(SHA256(code_verifier))

export const GRANT_AUDIENCE = "streamify-desktop";
export const GRANT_TTL_SECONDS = 120;
export const GRANT_VERSION = 1;

export interface GrantPayload {
  sub: string;
  aud: string;
  exp: number;
  jti: string;
  nonce: string;
  challenge: string;
}

export interface GrantInput {
  sub: string;
  challenge: string;
  nonce: string;
  ttlSeconds?: number;
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function readSecret(): string {
  const explicit = process.env.STREAMIFY_DEVICE_SECRET?.trim();
  if (explicit) return explicit;
  // Derive from the service role key so no new required config. The grant is
  // only ever minted server-side, so this never reaches the browser bundle.
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRole) {
    throw new Error(
      "STREAMIFY_DEVICE_SECRET or SUPABASE_SERVICE_ROLE_KEY is required to mint device grants"
    );
  }
  return createHash("sha256").update(serviceRole).digest("hex");
}

function sign(payload: GrantPayload): string {
  const body = `${GRANT_VERSION}.${base64UrlEncode(Buffer.from(JSON.stringify(payload)))}`;
  const signature = createHmac("sha256", readSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createGrant(input: GrantInput): string {
  const ttl = input.ttlSeconds ?? GRANT_TTL_SECONDS;
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 600) {
    throw new Error("grant ttl must be between 1 and 600 seconds");
  }
  if (!input.sub || !input.nonce || !input.challenge) {
    throw new Error("grant requires sub, nonce and challenge");
  }
  const payload: GrantPayload = {
    sub: input.sub,
    aud: GRANT_AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + ttl,
    jti: randomBytes(16).toString("hex"),
    nonce: input.nonce,
    challenge: input.challenge,
  };
  return sign(payload);
}

export interface GrantVerification {
  ok: boolean;
  reason?: string;
  payload?: GrantPayload;
}

export function verifyGrant(token: string): GrantVerification {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [version, body, signature] = parts;
  if (version !== String(GRANT_VERSION)) return { ok: false, reason: "version" };
  const expected = createHmac("sha256", readSecret())
    .update(`${version}.${body}`)
    .digest("base64url");
  if (!safeEqual(signature, expected)) return { ok: false, reason: "signature" };

  let payload: GrantPayload;
  try {
    payload = JSON.parse(base64UrlDecode(body).toString("utf8"));
  } catch {
    return { ok: false, reason: "payload" };
  }
  if (payload.aud !== GRANT_AUDIENCE) return { ok: false, reason: "audience" };
  if (payload.exp * 1000 < Date.now()) return { ok: false, reason: "expired" };
  if (!payload.sub || !payload.jti || !payload.nonce || !payload.challenge) {
    return { ok: false, reason: "incomplete" };
  }
  return { ok: true, payload };
}

export function challengeForVerifier(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function verifyChallenge(verifier: string, challenge: string): boolean {
  return safeEqual(challengeForVerifier(verifier), challenge);
}

export function randomNonce(): string {
  return randomBytes(16).toString("base64url");
}

export function randomVerifier(): string {
  return randomBytes(32).toString("base64url");
}
