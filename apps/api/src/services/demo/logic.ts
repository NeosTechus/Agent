// Demo agent — public homepage call (PRD 4.0).
//
// One Vapi assistant ("Mario's Pizza") shared across all demo callers.
// Browser callers go through Vapi's Web SDK; this endpoint provisions a
// short-lived public token tied to the Mario assistant. Phone callers use
// a dedicated Twilio number configured to forward to this assistant.
//
// Abuse mitigation:
//   - Cloudflare Turnstile (CAPTCHA) on the browser call button
//   - IP rate limit: 5 calls / hour
//   - Caller-id rate limit on the phone path: 3 / day (handled by Vapi
//     assistant config + Twilio carrier-side, not here)

import { ApiError } from "../../lib/errors";
import type { Bindings } from "../../env";

const IP_RATE_LIMIT_PER_HOUR = 5;
const HOUR_SECONDS = 60 * 60;

export async function checkRateLimit(env: Bindings, ip: string): Promise<void> {
  const key = `rl:demo:${ip}`;
  const raw = await env.RATE_LIMITS.get(key);
  const count = raw ? Number.parseInt(raw, 10) : 0;
  if (count >= IP_RATE_LIMIT_PER_HOUR) {
    throw new ApiError("RATE_LIMITED", "Demo limit reached. Try again in an hour.");
  }
  await env.RATE_LIMITS.put(key, String(count + 1), { expirationTtl: HOUR_SECONDS });
}

export async function verifyTurnstile(
  env: Bindings,
  token: string,
  ip: string,
): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) {
    // Dev mode — skip verification.
    return env.ENVIRONMENT !== "production";
  }
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET,
      response: token,
      remoteip: ip,
    }).toString(),
  });
  if (!res.ok) return false;
  const json = (await res.json()) as { success: boolean };
  return json.success === true;
}

export async function logDemoCall(
  env: Bindings,
  input: {
    caller_id: string | null;
    ip_address: string;
    business_name_entered: string | null;
    duration_seconds: number;
    transcript: string | null;
    ended_naturally: boolean;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO demo_calls (
       id, caller_id, ip_address, business_name_entered, duration_seconds,
       transcript, ended_naturally, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `dmc_${crypto.randomUUID().replace(/-/g, "")}`,
      input.caller_id,
      input.ip_address,
      input.business_name_entered,
      input.duration_seconds,
      input.transcript,
      input.ended_naturally ? 1 : 0,
      Math.floor(Date.now() / 1000),
    )
    .run();
}
