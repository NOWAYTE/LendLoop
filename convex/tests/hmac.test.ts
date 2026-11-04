import { describe, expect, test } from "vitest";
import { sign, signedHeaders, timingSafeEqual, verify } from "../lib/hmac";

const SECRET = "test-secret-not-real";
const NOW = Date.parse("2026-06-01T12:00:00Z");
const TS = String(NOW / 1000);
const BODY = '{"loanId":"abc","status":"sent"}';

describe("HMAC signing", () => {
  test("matches HMAC-SHA256 over timestamp + '.' + body", async () => {
    // Reference value from Node: createHmac("sha256", SECRET).update(`${TS}.${BODY}`).digest("hex").
    // n8n's Code node computes it the same way, so both sides agree byte for byte.
    expect(await sign(SECRET, TS, BODY)).toBe("09d865505142722e13c26bb0390f4f08cb2c2014f3560cdaa2ec6e119a0bef1d");
  });

  test("a valid signature is accepted", async () => {
    const signature = await sign(SECRET, TS, BODY);
    expect(await verify({ secret: SECRET, timestamp: TS, signature, rawBody: BODY, now: NOW })).toBe(true);
    // Hex case doesn't matter.
    expect(
      await verify({ secret: SECRET, timestamp: TS, signature: signature.toUpperCase(), rawBody: BODY, now: NOW }),
    ).toBe(true);
  });

  test("signedHeaders produces headers that verify", async () => {
    const headers = await signedHeaders(SECRET, "evt-1", BODY, NOW);
    expect(headers["X-LendLoop-Event-Id"]).toBe("evt-1");
    expect(
      await verify({
        secret: SECRET,
        timestamp: headers["X-LendLoop-Timestamp"]!,
        signature: headers["X-LendLoop-Signature"]!,
        rawBody: BODY,
        now: NOW,
      }),
    ).toBe(true);
  });

  test("a tampered body is rejected", async () => {
    const signature = await sign(SECRET, TS, BODY);
    const tampered = BODY.replace("sent", "failed");
    expect(await verify({ secret: SECRET, timestamp: TS, signature, rawBody: tampered, now: NOW })).toBe(false);
    // Even whitespace changes break it: we sign the raw bytes, not parsed JSON.
    expect(await verify({ secret: SECRET, timestamp: TS, signature, rawBody: `${BODY} `, now: NOW })).toBe(false);
  });

  test("a wrong secret is rejected", async () => {
    const signature = await sign("wrong-secret", TS, BODY);
    expect(await verify({ secret: SECRET, timestamp: TS, signature, rawBody: BODY, now: NOW })).toBe(false);
  });

  test("a stale or future timestamp is rejected", async () => {
    const stale = String(NOW / 1000 - 301);
    const future = String(NOW / 1000 + 301);
    for (const ts of [stale, future]) {
      const signature = await sign(SECRET, ts, BODY);
      expect(await verify({ secret: SECRET, timestamp: ts, signature, rawBody: BODY, now: NOW })).toBe(false);
    }
    // Inside the 5 minute window is fine.
    const recent = String(NOW / 1000 - 299);
    const signature = await sign(SECRET, recent, BODY);
    expect(await verify({ secret: SECRET, timestamp: recent, signature, rawBody: BODY, now: NOW })).toBe(true);
  });

  test("a changed timestamp invalidates the signature", async () => {
    const signature = await sign(SECRET, TS, BODY);
    const other = String(NOW / 1000 - 10);
    expect(await verify({ secret: SECRET, timestamp: other, signature, rawBody: BODY, now: NOW })).toBe(false);
  });

  test("missing secret, headers or malformed timestamp fail closed", async () => {
    const signature = await sign(SECRET, TS, BODY);
    expect(await verify({ secret: undefined, timestamp: TS, signature, rawBody: BODY, now: NOW })).toBe(false);
    expect(await verify({ secret: "", timestamp: TS, signature, rawBody: BODY, now: NOW })).toBe(false);
    expect(await verify({ secret: SECRET, timestamp: null, signature, rawBody: BODY, now: NOW })).toBe(false);
    expect(await verify({ secret: SECRET, timestamp: TS, signature: null, rawBody: BODY, now: NOW })).toBe(false);
    expect(await verify({ secret: SECRET, timestamp: `${TS}.5`, signature, rawBody: BODY, now: NOW })).toBe(false);
  });

  test("timingSafeEqual", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
