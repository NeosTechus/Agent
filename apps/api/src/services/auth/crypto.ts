// Password hashing + opaque-token utilities.
//
// Cloudflare Workers do not support Node's `crypto.scrypt` or argon2 natively
// without WASM. We use PBKDF2-SHA256 via the WebCrypto SubtleCrypto API
// available in Workers — 600,000 iterations per OWASP 2023 PBKDF2-SHA256
// guidance. This is a Tier-2 call (see DECISIONS.md). Argon2id via WASM
// (`@noble/hashes`) is the V2 upgrade path.
//
// Format stored in DB column `password_hash`:
//   pbkdf2$sha256$<iterations>$<saltB64>$<hashB64>
// Self-describing so the work-factor can be raised without a migration.

const PBKDF2_ITERATIONS = 600_000;
const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as BufferSource,
      iterations,
    },
    keyMaterial,
    KEY_LENGTH_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 5) return false;
  const [algo, hash, iterStr, saltB64, hashB64] = parts;
  if (algo !== "pbkdf2" || hash !== "sha256") return false;
  const iterations = Number.parseInt(iterStr ?? "", 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  if (!saltB64 || !hashB64) return false;
  const salt = fromBase64(saltB64);
  const expected = fromBase64(hashB64);
  const actual = await pbkdf2(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  // Constant-time compare.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= (actual[i] ?? 0) ^ (expected[i] ?? 0);
  }
  return diff === 0;
}

/** 32-byte url-safe random token, used for email verification + password reset. */
export function generateOpaqueToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 hex digest, used to store opaque tokens in the DB. */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  const arr = new Uint8Array(buf);
  let hex = "";
  for (const b of arr) hex += b.toString(16).padStart(2, "0");
  return hex;
}
