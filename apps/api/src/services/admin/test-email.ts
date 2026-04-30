// Admin-only test-email endpoint. Sends a sample of any email template to a
// chosen address so the founder can preview rendering before pointing real
// customers at it (Day 4 of the launch punch list).
//
// POST /v1/admin/email/test
// Body: { kind: <one of EmailMessage["kind"]>, to_email: string, organization_id?: string }
//
// The handler builds a fixture-shaped message for the requested kind,
// passes it through the existing `handleEmailSend(env, ...)` pipeline (so
// it's rendered + Resend-sent the same way the real producers go), and
// returns the rendered subject for confirmation.

import { z } from "zod";
import type { AppContext } from "../../types";
import { ApiError } from "../../lib/errors";
import { success } from "../../lib/responses";
import { handleEmailSend, type EmailMessage } from "../../queues/email-send";

const testEmailSchema = z.object({
  kind: z.enum([
    "verify_email",
    "password_reset",
    "invite_email",
    "impersonation_notice",
    "dunning_email",
    "weekly_digest",
    "deletion_confirmation",
    "call_summary",
  ]),
  to_email: z.string().email(),
  // Required for kinds that look up an organization owner. If omitted for
  // those kinds, we substitute the first org we can find.
  organization_id: z.string().optional(),
});

function requireAdmin(c: AppContext): { admin_email: string } {
  const email = c.get("admin_email");
  const id = c.get("admin_id");
  if (!email || !id) throw ApiError.unauthenticated("Admin auth required");
  return { admin_email: email };
}

async function pickAnyOrg(c: AppContext): Promise<string> {
  const row = await c.env.DB.prepare(
    `SELECT id FROM organizations WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
  ).first<{ id: string }>();
  if (!row) throw new ApiError("UNPROCESSABLE_ENTITY", "No organization to template against");
  return row.id;
}

function buildFixture(
  kind: EmailMessage["kind"],
  to_email: string,
  orgId: string,
): EmailMessage {
  switch (kind) {
    case "verify_email":
      return {
        kind,
        to_email,
        verify_link: "https://app.example.com/verify-email?token=fixture-token",
      };
    case "password_reset":
      return {
        kind,
        to_email,
        reset_link: "https://app.example.com/reset-password?token=fixture-token",
      };
    case "invite_email":
      return {
        kind,
        to_email,
        organization_id: orgId,
        invite_token: "fixture-invite-token",
        role: "manager",
      };
    case "impersonation_notice":
      return {
        kind,
        to_email,
        organization_id: orgId,
        admin_email: "founder@example.com",
        reason: "Concierge debugging session — fixture preview",
      };
    case "dunning_email":
      return {
        kind,
        organization_id: orgId,
        template: "payment_failed_day1",
      };
    case "weekly_digest":
      return {
        kind,
        organization_id: orgId,
        stats: { total_calls: 47, total_minutes: 124, flagged_count: 2, booked_count: 12 },
      };
    case "deletion_confirmation":
      return {
        kind,
        organization_id: orgId,
        user_email: to_email,
        scheduled_at: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      };
    case "call_summary":
      return {
        kind,
        organization_id: orgId,
        call_id: "cl_fixture",
        caller_phone: "+15555550100",
        duration_seconds: 92,
        outcome: "booked",
        transcript_excerpt:
          "Caller: Hi, can I get a table for 4 at 7pm Saturday?\nAgent: Of course — let me check availability… Yes, 7pm Saturday for 4 is open. Can I have your name?\nCaller: It's Maria.\nAgent: Booked, Maria. We'll text you a confirmation. See you Saturday!",
      };
  }
}

export const sendTestEmailHandler = async (c: AppContext) => {
  const { admin_email } = requireAdmin(c);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError("BAD_REQUEST", "Invalid JSON");
  }
  const parsed = testEmailSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Validation failed", parsed.error.issues);
  }
  const orgId =
    parsed.data.organization_id ??
    (await pickAnyOrg(c).catch(() => null)) ??
    null;

  // Some kinds NEED an org id to look up the owner; the others are fine.
  const needsOrg: EmailMessage["kind"][] = [
    "invite_email",
    "impersonation_notice",
    "dunning_email",
    "weekly_digest",
    "deletion_confirmation",
    "call_summary",
  ];
  if (needsOrg.includes(parsed.data.kind) && !orgId) {
    throw new ApiError("UNPROCESSABLE_ENTITY", "Need an organization_id for this kind");
  }

  const msg = buildFixture(parsed.data.kind, parsed.data.to_email, orgId ?? "");
  await handleEmailSend(c.env, msg);

  return c.json(
    success({ ok: true, kind: parsed.data.kind, sent_by: admin_email, to: parsed.data.to_email }),
  );
};
