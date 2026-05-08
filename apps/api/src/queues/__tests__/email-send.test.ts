// Unit tests for the email-send queue worker.
// Uses the Resend msw mock to intercept outbound email calls.

import { describe, expect, it } from "vitest";
import { resendStore } from "../../../../../tests/mocks/resend";
import { handleEmailSend, type EmailMessage } from "../email-send";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface OrgOwner { email: string; name: string | null; organization_name: string }

function makeDb(owner: OrgOwner | null = null, vertical: string | null = null) {
  return {
    prepare(sql: string) {
      return {
        bind(..._args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("FROM users")) return owner as T;
              if (sql.includes("FROM businesses")) {
                return vertical !== null ? { vertical } as T : null as T;
              }
              return null as T;
            },
          };
        },
      };
    },
  };
}

const DEFAULT_OWNER: OrgOwner = {
  email: "owner@example.com",
  name: "Alice",
  organization_name: "Alice's Bistro",
};

function makeEnv(owner = DEFAULT_OWNER, vertical: string | null = null) {
  return {
    DB: makeDb(owner, vertical),
    RESEND_API_KEY: "re_test_key",
    RESEND_FROM_EMAIL: "noreply@ai-receptionist.example.com",
    CUSTOMER_APP_URL: "https://app.example.com",
    LOG_LEVEL: "silent",
  } as unknown as Parameters<typeof handleEmailSend>[0];
}

// ---------------------------------------------------------------------------
// Tests — no-op cases
// ---------------------------------------------------------------------------
describe("handleEmailSend — no API key", () => {
  it("does nothing when RESEND_API_KEY is absent", async () => {
    const env = makeEnv();
    const envNoKey = { ...env, RESEND_API_KEY: undefined } as typeof env;
    const msg: EmailMessage = { kind: "verify_email", to_email: "user@example.com", verify_link: "https://example.com/verify" };
    await handleEmailSend(envNoKey, msg);
    expect(resendStore.emails).toHaveLength(0);
  });

  it("does nothing when RESEND_FROM_EMAIL is absent", async () => {
    const env = makeEnv();
    const envNoFrom = { ...env, RESEND_FROM_EMAIL: undefined } as typeof env;
    const msg: EmailMessage = { kind: "verify_email", to_email: "user@example.com", verify_link: "https://example.com/verify" };
    await handleEmailSend(envNoFrom, msg);
    expect(resendStore.emails).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — verify_email
// ---------------------------------------------------------------------------
describe("handleEmailSend — verify_email", () => {
  it("sends an email with a verify link to the user", async () => {
    const env = makeEnv();
    const msg: EmailMessage = {
      kind: "verify_email",
      to_email: "newuser@example.com",
      verify_link: "https://app.example.com/verify?token=abc",
    };
    await handleEmailSend(env, msg);
    expect(resendStore.emails).toHaveLength(1);
    const sent = resendStore.emails[0]!;
    expect(sent.to).toContain("newuser@example.com");
    expect(sent.subject).toContain("Verify");
    expect(sent.html).toContain("https://app.example.com/verify?token=abc");
  });
});

// ---------------------------------------------------------------------------
// Tests — password_reset
// ---------------------------------------------------------------------------
describe("handleEmailSend — password_reset", () => {
  it("sends a reset link email to the user", async () => {
    const env = makeEnv();
    const msg: EmailMessage = {
      kind: "password_reset",
      to_email: "user@example.com",
      reset_link: "https://app.example.com/reset?token=xyz",
    };
    await handleEmailSend(env, msg);
    expect(resendStore.emails[0]!.subject).toContain("Reset");
    expect(resendStore.emails[0]!.html).toContain("/reset?token=xyz");
  });
});

// ---------------------------------------------------------------------------
// Tests — invite_email
// ---------------------------------------------------------------------------
describe("handleEmailSend — invite_email", () => {
  it("sends an invitation email with an accept-invite link", async () => {
    const env = makeEnv();
    const msg: EmailMessage = {
      kind: "invite_email",
      to_email: "colleague@example.com",
      organization_id: "org_01",
      invite_token: "tok_abc123",
      role: "member",
    };
    await handleEmailSend(env, msg);
    const sent = resendStore.emails[0]!;
    expect(sent.html).toContain("accept-invite");
    expect(sent.html).toContain("tok_abc123");
  });
});

// ---------------------------------------------------------------------------
// Tests — impersonation_notice
// ---------------------------------------------------------------------------
describe("handleEmailSend — impersonation_notice", () => {
  it("sends an impersonation notice to the account owner", async () => {
    const env = makeEnv();
    const msg: EmailMessage = {
      kind: "impersonation_notice",
      to_email: "owner@example.com",
      organization_id: "org_01",
      admin_email: "admin@staff.example.com",
      reason: "billing dispute",
    };
    await handleEmailSend(env, msg);
    const sent = resendStore.emails[0]!;
    expect(sent.subject).toContain("support team");
    expect(sent.html).toContain("admin@staff.example.com");
    expect(sent.html).toContain("billing dispute");
  });
});

// ---------------------------------------------------------------------------
// Tests — dunning_email
// ---------------------------------------------------------------------------
describe("handleEmailSend — dunning_email", () => {
  it("sends day-1 payment failure email to the org owner", async () => {
    const env = makeEnv();
    const msg: EmailMessage = {
      kind: "dunning_email",
      organization_id: "org_01",
      template: "payment_failed_day1",
    };
    await handleEmailSend(env, msg);
    const sent = resendStore.emails[0]!;
    expect(sent.to).toContain("owner@example.com");
    expect(sent.subject).toContain("couldn't process");
  });

  it("sends service_suspended email", async () => {
    const env = makeEnv();
    const msg: EmailMessage = {
      kind: "dunning_email",
      organization_id: "org_01",
      template: "service_suspended",
    };
    await handleEmailSend(env, msg);
    expect(resendStore.emails[0]!.subject).toContain("suspended");
  });

  it("throws when org owner cannot be found", async () => {
    const envNoOwner = {
      ...makeEnv(),
      DB: makeDb(null),
    } as unknown as Parameters<typeof handleEmailSend>[0];
    const msg: EmailMessage = {
      kind: "dunning_email",
      organization_id: "org_missing",
      template: "payment_failed_day1",
    };
    await expect(handleEmailSend(envNoOwner, msg)).rejects.toThrow("owner_not_found");
  });
});

// ---------------------------------------------------------------------------
// Tests — weekly_digest
// ---------------------------------------------------------------------------
describe("handleEmailSend — weekly_digest", () => {
  it("sends a weekly digest with call stats to the org owner", async () => {
    const env = makeEnv();
    const msg: EmailMessage = {
      kind: "weekly_digest",
      organization_id: "org_01",
      stats: { total_calls: 42, total_minutes: 120, flagged_count: 3, booked_count: 15 },
    };
    await handleEmailSend(env, msg);
    const sent = resendStore.emails[0]!;
    expect(sent.html).toContain("42");
    expect(sent.html).toContain("15");
    expect(sent.subject).toContain("42 calls");
  });
});

// ---------------------------------------------------------------------------
// Tests — call_summary with vertical-specific subject lines
// ---------------------------------------------------------------------------
describe("handleEmailSend — call_summary", () => {
  it("uses 'Reservation captured' subject for restaurant vertical with booked outcome", async () => {
    const env = makeEnv(DEFAULT_OWNER, "restaurant");
    const msg: EmailMessage = {
      kind: "call_summary",
      organization_id: "org_01",
      call_id: "cll_01",
      caller_phone: "+15551234567",
      duration_seconds: 95,
      outcome: "booked",
      transcript_excerpt: "Caller wants 6pm table for two.",
    };
    await handleEmailSend(env, msg);
    expect(resendStore.emails[0]!.subject).toContain("Reservation captured");
  });

  it("uses 'Appointment request' subject for salon vertical with booked outcome", async () => {
    const env = makeEnv(DEFAULT_OWNER, "salon");
    const msg: EmailMessage = {
      kind: "call_summary",
      organization_id: "org_01",
      call_id: "cll_02",
      caller_phone: "+15559876543",
      duration_seconds: 65,
      outcome: "booked",
      transcript_excerpt: "Hair cut at 3pm tomorrow.",
    };
    await handleEmailSend(env, msg);
    expect(resendStore.emails[0]!.subject).toContain("Appointment request");
  });

  it("uses 'Action needed' subject for escalated outcome", async () => {
    const env = makeEnv(DEFAULT_OWNER, "generic");
    const msg: EmailMessage = {
      kind: "call_summary",
      organization_id: "org_01",
      call_id: "cll_03",
      caller_phone: null,
      duration_seconds: 30,
      outcome: "escalated",
      transcript_excerpt: "Caller insisted on speaking with a human.",
    };
    await handleEmailSend(env, msg);
    expect(resendStore.emails[0]!.subject).toContain("Action needed");
  });
});

// ---------------------------------------------------------------------------
// Tests — deletion_confirmation
// ---------------------------------------------------------------------------
describe("handleEmailSend — deletion_confirmation", () => {
  it("sends account deletion confirmation to the user email", async () => {
    const env = makeEnv();
    const scheduledAt = Math.floor(Date.now() / 1000) + 30 * 86400;
    const msg: EmailMessage = {
      kind: "deletion_confirmation",
      organization_id: "org_01",
      user_email: "leaving@example.com",
      scheduled_at: scheduledAt,
    };
    await handleEmailSend(env, msg);
    const sent = resendStore.emails[0]!;
    expect(sent.to).toContain("leaving@example.com");
    expect(sent.subject).toContain("deletion scheduled");
  });
});
