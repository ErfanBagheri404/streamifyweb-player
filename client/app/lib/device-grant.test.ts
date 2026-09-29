import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  GRANT_AUDIENCE,
  GRANT_TTL_SECONDS,
  challengeForVerifier,
  createGrant,
  randomNonce,
  randomVerifier,
  verifyChallenge,
  verifyGrant,
} from "./device-grant.ts";

process.env.STREAMIFY_DEVICE_SECRET = "test-device-secret-for-unit-tests";

// White-box helper: re-sign an arbitrary payload with the test secret so we
// can probe audience/completeness checks without touching the lib internals.
function resign(payload: object): string {
  const body = `1.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
  const sig = createHmac("sha256", "test-device-secret-for-unit-tests")
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

function mintArgs() {
  const verifier = randomVerifier();
  return {
    verifier,
    sub: "user-123",
    nonce: randomNonce(),
    challenge: challengeForVerifier(verifier),
  };
}

describe("device-grant", () => {
  it("valid roundtrip verifies with matching payload", () => {
    const before = Math.floor(Date.now() / 1000);
    const { verifier, sub, nonce, challenge } = mintArgs();
    const grant = createGrant({ sub, nonce, challenge });
    const result = verifyGrant(grant);
    assert.equal(result.ok, true);
    assert.equal(result.payload?.sub, sub);
    assert.equal(result.payload?.aud, GRANT_AUDIENCE);
    assert.equal(result.payload?.nonce, nonce);
    assert.equal(result.payload?.challenge, challenge);
    assert.ok(result.payload?.jti);
    assert.ok(
      result.payload!.exp >= before + GRANT_TTL_SECONDS - 1 &&
        result.payload!.exp <= before + GRANT_TTL_SECONDS + 1
    );
    assert.equal(verifyChallenge(verifier, result.payload!.challenge), true);
  });

  it("rejects a grant signed with a different secret (HMAC swap)", () => {
    const { sub, nonce, challenge } = mintArgs();
    const grant = createGrant({ sub, nonce, challenge });
    process.env.STREAMIFY_DEVICE_SECRET = "a-different-secret";
    try {
      const result = verifyGrant(grant);
      assert.equal(result.ok, false);
      assert.equal(result.reason, "signature");
    } finally {
      process.env.STREAMIFY_DEVICE_SECRET = "test-device-secret-for-unit-tests";
    }
  });

  it("rejects an expired grant", async () => {
    const { sub, nonce, challenge } = mintArgs();
    const grant = createGrant({ sub, nonce, challenge, ttlSeconds: 1 });
    assert.equal(verifyGrant(grant).ok, true);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const result = verifyGrant(grant);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "expired");
  });

  it("rejects a correctly-signed grant with the wrong audience", () => {
    const { sub, nonce, challenge } = mintArgs();
    const exp = Math.floor(Date.now() / 1000) + 120;
    const grant = resign({
      sub,
      aud: "someone-else",
      exp,
      jti: "jti-1",
      nonce,
      challenge,
    });
    const result = verifyGrant(grant);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "audience");
  });

  it("binds verifier to challenge, rejects wrong verifier", () => {
    const verifier = randomVerifier();
    const challenge = challengeForVerifier(verifier);
    assert.equal(challenge.length, 43); // base64url(SHA256) is always 43 chars
    assert.equal(verifyChallenge(verifier, challenge), true);
    assert.equal(verifyChallenge(randomVerifier(), challenge), false);
    assert.equal(verifyChallenge(verifier, challengeForVerifier("other")), false);
    assert.equal(verifyChallenge("", challenge), false);
  });

  it("rejects malformed input", () => {
    for (const token of ["", "abc", "a.b", "a.b.c.d", "2.e30.sig"]) {
      const result = verifyGrant(token);
      assert.equal(result.ok, false, token || "(empty)");
      assert.ok(["malformed", "version"].includes(result.reason!));
    }
    // Tampered body fails the signature check.
    const { sub, nonce, challenge } = mintArgs();
    const grant = createGrant({ sub, nonce, challenge });
    const [version, body, sig] = grant.split(".");
    const tampered = `${version}.${body.slice(0, -1)}${body.endsWith("A") ? "B" : "A"}.${sig}`;
    const tamperedResult = verifyGrant(tampered);
    assert.equal(tamperedResult.ok, false);
    assert.equal(tamperedResult.reason, "signature");
    // Valid signature but undecodable payload.
    const badBody = `1.${Buffer.from("not-json{{{").toString("base64url")}`;
    const badSig = createHmac(
      "sha256",
      "test-device-secret-for-unit-tests"
    )
      .update(badBody)
      .digest("base64url");
    const badPayload = verifyGrant(`${badBody}.${badSig}`);
    assert.equal(badPayload.ok, false);
    assert.equal(badPayload.reason, "payload");
  });

  it("rejects a signed grant missing required fields", () => {
    const { nonce, challenge } = mintArgs();
    const exp = Math.floor(Date.now() / 1000) + 120;
    const grant = resign({
      aud: GRANT_AUDIENCE,
      exp,
      jti: "jti-2",
      nonce,
      challenge,
      // sub missing
    });
    const result = verifyGrant(grant);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "incomplete");
  });

  it("createGrant validates its inputs", () => {
    const { sub, nonce, challenge } = mintArgs();
    assert.throws(() => createGrant({ sub: "", nonce, challenge }), /sub/);
    assert.throws(() => createGrant({ sub, nonce: "", challenge }), /nonce/);
    assert.throws(() => createGrant({ sub, nonce, challenge: "" }), /challenge/);
    assert.throws(
      () => createGrant({ sub, nonce, challenge, ttlSeconds: 0 }),
      /ttl/
    );
    assert.throws(
      () => createGrant({ sub, nonce, challenge, ttlSeconds: 601 }),
      /ttl/
    );
  });

  it("random helpers produce unique values", () => {
    assert.notEqual(randomNonce(), randomNonce());
    assert.notEqual(randomVerifier(), randomVerifier());
  });
});
