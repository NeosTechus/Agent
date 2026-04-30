// Auth service integration tests.
//
// Drives the full Hono app via `app.fetch(req)` with the in-memory D1 + KV
// stand-ins from `_harness.ts`. Every assertion targets the public HTTP
// contract (status, envelope, Set-Cookie) — handlers are free to refactor
// without breaking these tests.

import { describe, expect, it } from 'vitest';
import {
  buildTestApp,
  callApp,
  cookieValueFromSetCookie,
  extractSetCookie,
} from './_harness';

const VALID_PASSWORD = 'CorrectHorse42Battery';
const VALID_BODY = {
  email: 'founder@example.com',
  password: VALID_PASSWORD,
  business_name: 'Cafe Latte LLC',
};

describe('POST /v1/auth/signup', () => {
  it('creates a user + organization and sets a session cookie (201)', async () => {
    const env = buildTestApp();
    const res = await callApp(env, '/v1/auth/signup', {
      method: 'POST',
      body: VALID_BODY,
    });

    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { user_id: string; organization_id: string } };
    expect(json.data.user_id).toMatch(/^usr_/);
    expect(json.data.organization_id).toMatch(/^org_/);

    const setCookie = extractSetCookie(res);
    expect(setCookie).toContain('ai_receptionist_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');

    expect(env.db.tables.users.size).toBe(1);
    expect(env.db.tables.organizations.size).toBe(1);
    expect(env.db.tables.organization_members.size).toBe(1);
  });

  it('returns 400 with VALIDATION_ERROR for missing fields', async () => {
    const env = buildTestApp();
    const res = await callApp(env, '/v1/auth/signup', {
      method: 'POST',
      body: { email: 'x' }, // missing password + business_name + bad email
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects weak passwords (< 12 chars) with 400', async () => {
    const env = buildTestApp();
    const res = await callApp(env, '/v1/auth/signup', {
      method: 'POST',
      body: { ...VALID_BODY, password: 'short1' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid email format with 400', async () => {
    const env = buildTestApp();
    const res = await callApp(env, '/v1/auth/signup', {
      method: 'POST',
      body: { ...VALID_BODY, email: 'not-an-email' },
    });
    expect(res.status).toBe(400);
  });

  it('returns 409 EMAIL_EXISTS on duplicate email', async () => {
    const env = buildTestApp();
    await callApp(env, '/v1/auth/signup', { method: 'POST', body: VALID_BODY });
    const res = await callApp(env, '/v1/auth/signup', {
      method: 'POST',
      body: VALID_BODY,
    });
    expect(res.status).toBe(409);
    const json = (await res.json()) as {
      error: { code: string; details?: { code?: string } };
    };
    expect(json.error.code).toBe('CONFLICT');
    expect(json.error.details?.code).toBe('EMAIL_EXISTS');
  });

  it('returns 400 for malformed JSON body', async () => {
    const env = buildTestApp();
    const req = new Request('http://localhost/v1/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const res = await env.app.fetch(req, env.bindings as unknown as Record<string, unknown>);
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/auth/login', () => {
  async function setup() {
    const env = buildTestApp();
    await callApp(env, '/v1/auth/signup', { method: 'POST', body: VALID_BODY });
    return env;
  }

  it('returns 200 + session cookie on valid credentials', async () => {
    const env = await setup();
    const res = await callApp(env, '/v1/auth/login', {
      method: 'POST',
      body: { email: VALID_BODY.email, password: VALID_PASSWORD },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { role: string } };
    expect(json.data.role).toBe('owner');
    expect(extractSetCookie(res)).toContain('ai_receptionist_session=');
  });

  it('returns 401 on wrong password', async () => {
    const env = await setup();
    const res = await callApp(env, '/v1/auth/login', {
      method: 'POST',
      body: { email: VALID_BODY.email, password: 'wrong-password-12345' },
    });
    expect(res.status).toBe(401);
    const json = (await res.json()) as {
      error: { code: string; details?: { code?: string } };
    };
    expect(json.error.code).toBe('UNAUTHENTICATED');
    expect(json.error.details?.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 on unknown email (no enumeration leak)', async () => {
    const env = await setup();
    const res = await callApp(env, '/v1/auth/login', {
      method: 'POST',
      body: { email: 'nobody@example.com', password: VALID_PASSWORD },
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/auth/logout', () => {
  it('clears the session cookie and removes the session record', async () => {
    const env = buildTestApp();
    const signup = await callApp(env, '/v1/auth/signup', {
      method: 'POST',
      body: VALID_BODY,
    });
    const cookie = cookieValueFromSetCookie(extractSetCookie(signup) ?? '');
    expect(cookie).toBeTruthy();

    const before = env.sessions.store.size;
    expect(before).toBe(1);

    const res = await callApp(env, '/v1/auth/logout', {
      method: 'POST',
      cookie,
    });
    expect(res.status).toBe(200);
    const setCookie = extractSetCookie(res) ?? '';
    expect(setCookie).toContain('Max-Age=0');
    expect(env.sessions.store.size).toBe(0);
  });
});

describe('GET /v1/auth/session', () => {
  it('returns 401 when no cookie is present', async () => {
    const env = buildTestApp();
    const res = await callApp(env, '/v1/auth/session');
    expect(res.status).toBe(401);
  });

  it('returns 200 + payload when authenticated', async () => {
    const env = buildTestApp();
    const signup = await callApp(env, '/v1/auth/signup', {
      method: 'POST',
      body: VALID_BODY,
    });
    const cookie = cookieValueFromSetCookie(extractSetCookie(signup) ?? '');
    const res = await callApp(env, '/v1/auth/session', { cookie });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { user: { email: string }; role: string };
    };
    expect(json.data.user.email).toBe(VALID_BODY.email);
    expect(json.data.role).toBe('owner');
  });
});

describe('Password reset flow', () => {
  // Full happy-path cycle: request → confirm → re-login.
  // The `request` endpoint always 200s (no enumeration); we read the new
  // token directly off the in-memory user row, which mirrors what we'd
  // grab from the email log line in a real e2e.
  it('completes request → confirm → login with new password', async () => {
    const env = buildTestApp();
    await callApp(env, '/v1/auth/signup', { method: 'POST', body: VALID_BODY });

    const reqRes = await callApp(env, '/v1/auth/password-reset/request', {
      method: 'POST',
      body: { email: VALID_BODY.email },
    });
    expect(reqRes.status).toBe(200);

    // Pull the (hashed) reset token the handler set; for the confirm step
    // we need the plaintext token. Since `requestPasswordReset` only logs
    // the plaintext, we instead drive the reset by calling
    // `confirmPasswordReset` with a known plaintext we mint here — we set
    // the matching SHA256 onto the user row.
    // TODO(test-infra): expose the email log capture so we can read the
    // real plaintext token end-to-end. Until then, this test drives the
    // confirm endpoint by injecting a known token directly.
    const user = [...env.db.tables.users.values()][0];
    expect(user).toBeTruthy();
    const plaintext = 'reset-token-fixture-0123456789abcdef';
    const tokenHash = await sha256Hex(plaintext);
    if (user) {
      user.password_reset_token = tokenHash;
      user.password_reset_expires = Date.now() + 60_000;
    }

    const newPassword = 'BrandNewPasswordX9';
    const confirm = await callApp(env, '/v1/auth/password-reset/confirm', {
      method: 'POST',
      body: { token: plaintext, password: newPassword },
    });
    expect(confirm.status).toBe(200);

    // Old password no longer works.
    const oldLogin = await callApp(env, '/v1/auth/login', {
      method: 'POST',
      body: { email: VALID_BODY.email, password: VALID_PASSWORD },
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await callApp(env, '/v1/auth/login', {
      method: 'POST',
      body: { email: VALID_BODY.email, password: newPassword },
    });
    expect(newLogin.status).toBe(200);
  });

  it('rejects an expired reset token with 401', async () => {
    const env = buildTestApp();
    await callApp(env, '/v1/auth/signup', { method: 'POST', body: VALID_BODY });

    const user = [...env.db.tables.users.values()][0];
    expect(user).toBeTruthy();
    const plaintext = 'expired-token-fixture-0123456789';
    const tokenHash = await sha256Hex(plaintext);
    if (user) {
      user.password_reset_token = tokenHash;
      user.password_reset_expires = Date.now() - 60_000; // already expired
    }

    const res = await callApp(env, '/v1/auth/password-reset/confirm', {
      method: 'POST',
      body: { token: plaintext, password: 'NewPassword12345' },
    });
    expect(res.status).toBe(401);
  });
});

describe.todo('OAuth start + callback (Google + Microsoft)', () => {
  // TODO(integrations): wire once OAuth client IDs are configured (Phase 2.5).
});

// ---------------------------------------------------------------------------
// Local helper — same algorithm as auth/crypto.ts:sha256Hex.
// We re-implement here so the test file doesn't reach into service code.
// ---------------------------------------------------------------------------
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  const arr = new Uint8Array(buf);
  let hex = '';
  for (const b of arr) hex += b.toString(16).padStart(2, '0');
  return hex;
}
