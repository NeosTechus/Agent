// Unit tests for HMAC signature helpers.
//
// Covers:
//   - Generic verifyHmacSha256 (used by Vapi/Twilio/Resend in later phases).
//   - Stripe-specific verifyStripeSignature (used by /v1/webhooks/stripe).
//
// Both helpers MUST do constant-time compares — we exercise the
// known-good / one-byte-off vectors to give that path coverage.

import { describe, expect, it } from 'vitest';
import {
  verifyHmacSha256,
  verifyStripeSignature,
} from '../signature';

async function hmacHex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  let hex = '';
  for (const b of new Uint8Array(sig)) hex += b.toString(16).padStart(2, '0');
  return hex;
}

describe('verifyHmacSha256', () => {
  it('accepts a known-good signature', async () => {
    const body = '{"hello":"world"}';
    const secret = 'top-secret';
    const sig = await hmacHex(secret, body);
    expect(await verifyHmacSha256(body, sig, secret)).toBe(true);
  });

  it('rejects a one-byte-off signature', async () => {
    const body = '{"hello":"world"}';
    const secret = 'top-secret';
    const sig = await hmacHex(secret, body);
    const tampered = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
    expect(await verifyHmacSha256(body, tampered, secret)).toBe(false);
  });

  it('rejects malformed (odd-length) hex', async () => {
    expect(await verifyHmacSha256('body', 'abcde', 'secret')).toBe(false);
  });

  it('rejects empty signature', async () => {
    expect(await verifyHmacSha256('body', '', 'secret')).toBe(false);
  });
});

describe('verifyStripeSignature', () => {
  const SECRET = 'whsec_test';
  const BODY = '{"id":"evt_1","type":"invoice.paid"}';

  async function buildHeader(ts: number, body: string, secret: string) {
    const sig = await hmacHex(secret, `${ts}.${body}`);
    return `t=${ts},v1=${sig}`;
  }

  it('accepts a fresh, well-signed header', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = await buildHeader(ts, BODY, SECRET);
    expect(await verifyStripeSignature(BODY, header, SECRET)).toBe(true);
  });

  it('rejects a header older than the tolerance window', async () => {
    const ts = Math.floor(Date.now() / 1000) - 600; // 10 min ago, default 5
    const header = await buildHeader(ts, BODY, SECRET);
    expect(await verifyStripeSignature(BODY, header, SECRET)).toBe(false);
  });

  it('rejects a body that doesn’t match the signature', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = await buildHeader(ts, BODY, SECRET);
    expect(await verifyStripeSignature('{"tampered":true}', header, SECRET)).toBe(
      false,
    );
  });

  it('rejects when the Stripe-Signature header is missing', async () => {
    expect(await verifyStripeSignature(BODY, null, SECRET)).toBe(false);
    expect(await verifyStripeSignature(BODY, undefined, SECRET)).toBe(false);
  });

  it('rejects when there is no v1 entry', async () => {
    const ts = Math.floor(Date.now() / 1000);
    expect(
      await verifyStripeSignature(BODY, `t=${ts},v0=deadbeef`, SECRET),
    ).toBe(false);
  });

  it('honors a custom tolerance + injected now()', async () => {
    const fakeNow = 1_700_000_000_000;
    const ts = Math.floor(fakeNow / 1000) - 600;
    const header = await buildHeader(ts, BODY, SECRET);
    expect(
      await verifyStripeSignature(BODY, header, SECRET, {
        toleranceSeconds: 1_200,
        now: () => fakeNow,
      }),
    ).toBe(true);
  });
});
