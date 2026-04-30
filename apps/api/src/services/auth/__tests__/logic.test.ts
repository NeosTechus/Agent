// Unit tests for pure auth helpers — exercises the Web Crypto-backed
// password hash + opaque-token utilities and the static TTL constants.
//
// These are co-located with the source per qa.md convention.

import { describe, expect, it } from 'vitest';
import {
  EMAIL_VERIFY_TTL_MS,
  PASSWORD_RESET_TTL_MS,
} from '../logic';
import {
  generateOpaqueToken,
  hashPassword,
  sha256Hex,
  verifyPassword,
} from '../crypto';

describe('auth/crypto.hashPassword + verifyPassword', () => {
  it('verifies a correctly-hashed password (round-trip)', async () => {
    const stored = await hashPassword('CorrectHorse42Battery');
    expect(stored.startsWith('pbkdf2$sha256$600000$')).toBe(true);
    expect(await verifyPassword('CorrectHorse42Battery', stored)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('CorrectHorse42Battery');
    expect(await verifyPassword('wrong-password', stored)).toBe(false);
  });

  it('returns false for malformed stored values', async () => {
    expect(await verifyPassword('any', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('any', 'pbkdf2$sha256$bad')).toBe(false);
    expect(await verifyPassword('any', 'pbkdf2$sha256$x$y$z')).toBe(false);
  });

  it('produces a different hash for the same password (random salt)', async () => {
    const a = await hashPassword('repeated-password-12345');
    const b = await hashPassword('repeated-password-12345');
    expect(a).not.toBe(b);
    expect(await verifyPassword('repeated-password-12345', a)).toBe(true);
    expect(await verifyPassword('repeated-password-12345', b)).toBe(true);
  });
});

describe('auth/crypto.generateOpaqueToken + sha256Hex', () => {
  it('generates URL-safe tokens of stable length', async () => {
    const t1 = generateOpaqueToken();
    const t2 = generateOpaqueToken();
    expect(t1).not.toBe(t2);
    expect(t1.length).toBeGreaterThanOrEqual(43);
    expect(/^[A-Za-z0-9_-]+$/.test(t1)).toBe(true);
  });

  it('sha256Hex returns a 64-char lowercase hex digest', async () => {
    const hex = await sha256Hex('hello');
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('auth/logic TTL constants (token expiry math)', () => {
  it('PASSWORD_RESET_TTL_MS is exactly 15 minutes (PRD 5.1)', () => {
    expect(PASSWORD_RESET_TTL_MS).toBe(15 * 60 * 1000);
  });

  it('EMAIL_VERIFY_TTL_MS is 24 hours', () => {
    expect(EMAIL_VERIFY_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('expiry math: now + TTL is ahead of now', () => {
    const now = 1_700_000_000_000;
    expect(now + PASSWORD_RESET_TTL_MS).toBeGreaterThan(now);
    expect(now + EMAIL_VERIFY_TTL_MS).toBeGreaterThan(now + PASSWORD_RESET_TTL_MS);
  });
});
