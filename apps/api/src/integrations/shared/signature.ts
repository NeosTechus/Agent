// HMAC signature verification helpers — pure Web Crypto.
//
// Two flavors:
//   - `verifyHmacSha256(body, signature, secret)` — generic. `signature` is
//     a hex-encoded HMAC-SHA256 over `body`. Used by Vapi/Twilio/Resend
//     webhook handlers when they land.
//   - `verifyStripeSignature(body, header, secret)` — Stripe's specific
//     `Stripe-Signature` header format: `t=<timestamp>,v1=<sig>,v0=<sig>`
//     where the signed payload is `<timestamp>.<rawBody>`. Tolerance
//     defaults to 5 minutes, matching Stripe's CLI.
//
// Both compares are constant-time.

const enc = new TextEncoder();

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (!Number.isFinite(byte)) return null;
    out[i] = byte;
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return new Uint8Array(sig);
}

/** Verify a generic hex-encoded HMAC-SHA256 signature over `body`. */
export async function verifyHmacSha256(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const expected = await hmacSha256(secret, body);
  const provided = hexToBytes(signature.trim());
  if (!provided) return false;
  return constantTimeEqual(expected, provided);
}

export interface StripeSignatureOptions {
  /** Maximum allowed clock skew, in seconds. Default 5 minutes. */
  toleranceSeconds?: number;
  /** Override `Date.now()` for tests. */
  now?: () => number;
}

/**
 * Verify a Stripe-Signature header.
 *
 * Header format: `t=<timestamp>,v1=<sig>[,v1=<sig>...][,v0=<sig>]`
 * Signed payload: `${t}.${rawBody}`
 *
 * Returns true iff the timestamp is within tolerance AND at least one `v1`
 * signature matches the HMAC-SHA256 of the signed payload under `secret`.
 */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  opts: StripeSignatureOptions = {},
): Promise<boolean> {
  if (!header) return false;
  const tolerance = opts.toleranceSeconds ?? 300;
  const now = (opts.now ?? Date.now)();

  // Parse `k=v` pairs.
  let timestamp: string | null = null;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (!k || !v) continue;
    if (k === "t") timestamp = v;
    else if (k === "v1") v1.push(v);
  }
  if (!timestamp || v1.length === 0) return false;

  const tsNum = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(tsNum)) return false;

  // Replay protection.
  const skew = Math.abs(now / 1000 - tsNum);
  if (skew > tolerance) return false;

  const expected = bytesToHex(
    await hmacSha256(secret, `${timestamp}.${rawBody}`),
  );
  const expectedBytes = enc.encode(expected);
  for (const candidate of v1) {
    const candBytes = enc.encode(candidate.trim());
    if (constantTimeEqual(expectedBytes, candBytes)) return true;
  }
  return false;
}
