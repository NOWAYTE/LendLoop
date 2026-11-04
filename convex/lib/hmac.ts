// HMAC-SHA256 request signing shared by both directions (Convex -> n8n, n8n -> Convex).
// Web Crypto only, so it runs in the default Convex runtime, httpActions and tests.
//
//   X-LendLoop-Timestamp: unix seconds
//   X-LendLoop-Signature: hex(HMAC_SHA256(secret, timestamp + "." + rawBody))
//   X-LendLoop-Event-Id:  unique id for the request (UUID)

import { SIGNATURE_TOLERANCE_SECONDS } from "./constants";

export const HEADER_TIMESTAMP = "X-LendLoop-Timestamp";
export const HEADER_SIGNATURE = "X-LendLoop-Signature";
export const HEADER_EVENT_ID = "X-LendLoop-Event-Id";

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sign(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  return toHex(mac);
}

/**
 * Constant-time string comparison: the loop always runs over the full length,
 * so timing doesn't reveal how many leading characters matched. Signature
 * length is public (64 hex chars), so the early length check leaks nothing.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type VerifyInput = {
  secret: string | undefined;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  /** Current time in ms; injectable for tests. */
  now?: number;
  toleranceSeconds?: number;
};

/** True only for a fresh, correctly signed request. Fails closed when the secret is unset. */
export async function verify({
  secret,
  timestamp,
  signature,
  rawBody,
  now = Date.now(),
  toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
}: VerifyInput): Promise<boolean> {
  if (!secret || !timestamp || !signature) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  // Rejects both stale requests (replays) and ones dated in the future.
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > toleranceSeconds) return false;
  const expected = await sign(secret, timestamp, rawBody);
  return timingSafeEqual(expected, signature.toLowerCase());
}

/** Headers for an outgoing signed request. */
export async function signedHeaders(
  secret: string,
  eventId: string,
  rawBody: string,
  now: number = Date.now(),
): Promise<Record<string, string>> {
  const timestamp = String(Math.floor(now / 1000));
  return {
    [HEADER_TIMESTAMP]: timestamp,
    [HEADER_SIGNATURE]: await sign(secret, timestamp, rawBody),
    [HEADER_EVENT_ID]: eventId,
  };
}
