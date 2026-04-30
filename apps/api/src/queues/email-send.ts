// Email send queue consumer.
//
// Every domain event that needs to email someone enqueues a typed message
// onto `EMAIL_SEND_QUEUE` (see producers in services/team, services/admin,
// services/account, queues/dunning, queues/weekly-digest). This worker
// renders a template per `kind`, calls Resend, and acks.
//
// Templates are inline plain-HTML for V1 — no template engine. When the
// design system stabilizes we move to react-email or mjml.

import type { Bindings } from "../env";
import { ResendClient } from "../integrations/resend";
import { createLogger, type LogLevel } from "../lib/logger";

export type EmailMessage =
  | {
      kind: "verify_email";
      to_email: string;
      verify_link: string;
    }
  | {
      kind: "password_reset";
      to_email: string;
      reset_link: string;
    }
  | {
      kind: "invite_email";
      to_email: string;
      organization_id: string;
      invite_token: string;
      role: string;
    }
  | {
      kind: "impersonation_notice";
      to_email: string;
      organization_id: string;
      admin_email: string;
      reason: string;
    }
  | {
      kind: "dunning_email";
      organization_id: string;
      template:
        | "payment_failed_day1"
        | "payment_failed_day3"
        | "payment_failed_day7"
        | "service_suspended";
    }
  | {
      kind: "weekly_digest";
      organization_id: string;
      stats: {
        total_calls: number;
        total_minutes: number;
        flagged_count: number;
        booked_count: number;
      };
    }
  | {
      kind: "deletion_confirmation";
      organization_id: string;
      user_email: string;
      scheduled_at: number;
    }
  | {
      // PRD 5.21 — owner summary after every real call.
      kind: "call_summary";
      organization_id: string;
      call_id: string;
      caller_phone: string | null;
      duration_seconds: number;
      outcome: string | null;
      transcript_excerpt: string;
    };

interface OwnerLookup {
  email: string;
  name: string | null;
  organization_name: string;
}

async function getOrgOwner(
  env: Bindings,
  organizationId: string,
): Promise<OwnerLookup | null> {
  return env.DB.prepare(
    `SELECT u.email AS email, u.name AS name, o.name AS organization_name
       FROM users u
       JOIN organization_members m ON m.user_id = u.id
       JOIN organizations o ON o.id = m.organization_id
      WHERE m.organization_id = ? AND m.role = 'owner'
      ORDER BY m.invited_at ASC LIMIT 1`,
  )
    .bind(organizationId)
    .first<OwnerLookup>();
}

function appUrl(env: Bindings, path: string): string {
  const base = env.CUSTOMER_APP_URL ?? "https://app.example.com";
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c),
  );
}

async function render(env: Bindings, msg: EmailMessage): Promise<{
  to: string;
  email: RenderedEmail;
}> {
  switch (msg.kind) {
    case "verify_email": {
      const link = msg.verify_link;
      return {
        to: msg.to_email,
        email: {
          subject: "Verify your email",
          html: `<p>Welcome! Please verify your email by clicking <a href="${escapeHtml(link)}">this link</a>. The link expires in 24 hours.</p>`,
          text: `Verify your email: ${link}`,
        },
      };
    }
    case "password_reset": {
      return {
        to: msg.to_email,
        email: {
          subject: "Reset your password",
          html: `<p>Click <a href="${escapeHtml(msg.reset_link)}">here</a> to reset your password. The link expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`,
          text: `Reset your password: ${msg.reset_link}`,
        },
      };
    }
    case "invite_email": {
      const link = appUrl(env, `/accept-invite?token=${encodeURIComponent(msg.invite_token)}`);
      return {
        to: msg.to_email,
        email: {
          subject: "You've been invited to join an AI receptionist team",
          html: `<p>You've been invited as a <strong>${escapeHtml(msg.role)}</strong>. Accept the invite: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a>. The link expires in 7 days.</p>`,
          text: `You've been invited (role: ${msg.role}). Accept: ${link}`,
        },
      };
    }
    case "impersonation_notice": {
      return {
        to: msg.to_email,
        email: {
          subject: "Our support team accessed your account",
          html: `<p>A staff member (<strong>${escapeHtml(msg.admin_email)}</strong>) just started a 1-hour impersonation session on your account.</p><p><strong>Reason given:</strong> ${escapeHtml(msg.reason)}</p><p>If this wasn't expected, reply to this email.</p>`,
          text: `${msg.admin_email} accessed your account. Reason: ${msg.reason}`,
        },
      };
    }
    case "dunning_email": {
      const owner = await getOrgOwner(env, msg.organization_id);
      if (!owner) throw new Error("owner_not_found");
      const billingLink = appUrl(env, "/dashboard/billing");
      const subjects: Record<string, string> = {
        payment_failed_day1: "We couldn't process your payment",
        payment_failed_day3: "Action required — payment still failing",
        payment_failed_day7: "Final notice before service is suspended",
        service_suspended: "Your service has been suspended",
      };
      const bodies: Record<string, string> = {
        payment_failed_day1: `Hi ${escapeHtml(owner.name ?? owner.email)} — your last invoice didn't go through. Please update your payment method: <a href="${billingLink}">${billingLink}</a>.`,
        payment_failed_day3: `We tried again but the charge still failed. Please update your card by Day 7 to avoid service interruption: <a href="${billingLink}">${billingLink}</a>.`,
        payment_failed_day7: `Your service will be suspended tomorrow if your payment isn't resolved. <a href="${billingLink}">Update billing →</a>.`,
        service_suspended: `Your AI receptionist is paused — calls are going to voicemail until you update billing: <a href="${billingLink}">${billingLink}</a>.`,
      };
      return {
        to: owner.email,
        email: {
          subject: subjects[msg.template] ?? "Billing update",
          html: `<p>${bodies[msg.template] ?? ""}</p>`,
          text: bodies[msg.template]?.replace(/<[^>]+>/g, "") ?? "",
        },
      };
    }
    case "weekly_digest": {
      const owner = await getOrgOwner(env, msg.organization_id);
      if (!owner) throw new Error("owner_not_found");
      const link = appUrl(env, "/dashboard");
      const { total_calls, total_minutes, flagged_count, booked_count } = msg.stats;
      return {
        to: owner.email,
        email: {
          subject: `Your week at ${escapeHtml(owner.organization_name)}: ${total_calls} calls`,
          html: `<p>Hi ${escapeHtml(owner.name ?? owner.email)},</p>
                 <p>Here's how your AI receptionist did this week:</p>
                 <ul>
                   <li>${total_calls} calls (${total_minutes} minutes)</li>
                   <li>${booked_count} bookings / appointments captured</li>
                   <li>${flagged_count} call(s) flagged for review</li>
                 </ul>
                 <p><a href="${link}">Open dashboard →</a></p>`,
          text: `${total_calls} calls, ${total_minutes} min, ${booked_count} bookings, ${flagged_count} flagged. ${link}`,
        },
      };
    }
    case "call_summary": {
      // PRD 5.21 — owner-facing per-call summary. Vertical-specific framing
      // (restaurant → reservation receipt, salon/dental/auto/real_estate →
      // appointment request, generic → call summary).
      const owner = await getOrgOwner(env, msg.organization_id);
      if (!owner) throw new Error("owner_not_found");
      const business = await env.DB.prepare(
        `SELECT vertical FROM businesses
          WHERE organization_id = ? AND deleted_at IS NULL
          ORDER BY created_at ASC LIMIT 1`,
      )
        .bind(msg.organization_id)
        .first<{ vertical: string | null }>();
      const vertical = business?.vertical ?? "generic";
      const callLink = appUrl(env, `/calls/${msg.call_id}`);
      const caller = msg.caller_phone ?? "Unknown caller";
      const durationFmt =
        msg.duration_seconds < 60
          ? `${msg.duration_seconds}s`
          : `${Math.floor(msg.duration_seconds / 60)}m ${msg.duration_seconds % 60}s`;
      const outcomeFmt = msg.outcome ?? "info";

      // Subject + headline by (outcome, vertical).
      let subject: string;
      let headline: string;
      if (msg.outcome === "booked") {
        if (vertical === "restaurant") {
          subject = `Reservation captured from ${caller}`;
          headline = "Reservation captured";
        } else if (
          vertical === "salon" ||
          vertical === "dental" ||
          vertical === "auto" ||
          vertical === "real_estate"
        ) {
          subject = `Appointment request from ${caller}`;
          headline = "Appointment request";
        } else {
          subject = `Booking captured from ${caller}`;
          headline = "Booking captured";
        }
      } else if (msg.outcome === "escalated") {
        subject = `Action needed: caller from ${caller} requested a human`;
        headline = "Action needed — caller requested a human";
      } else if (msg.outcome === "voicemail") {
        subject = `Missed call: ${caller}`;
        headline = "Caller left a voicemail";
      } else {
        subject = `New call from ${caller} — ${outcomeFmt} (${durationFmt})`;
        headline = "Call summary";
      }

      return {
        to: owner.email,
        email: {
          subject,
          html: `<p><strong>${escapeHtml(headline)}</strong></p>
                 <p>From: ${escapeHtml(caller)}<br/>
                    Duration: ${durationFmt}<br/>
                    Outcome: ${escapeHtml(outcomeFmt)}</p>
                 <p><strong>Transcript excerpt:</strong></p>
                 <blockquote style="border-left:3px solid #cbd5e1;padding-left:12px;color:#334155;">
                   ${escapeHtml(msg.transcript_excerpt).replace(/\n/g, "<br/>")}
                 </blockquote>
                 <p><a href="${callLink}">Open full call →</a></p>`,
          text: `${headline}\nFrom: ${caller}\nDuration: ${durationFmt}\nOutcome: ${outcomeFmt}\n\n${msg.transcript_excerpt}\n\n${callLink}`,
        },
      };
    }
    case "deletion_confirmation": {
      const date = new Date(msg.scheduled_at * 1000).toLocaleDateString();
      return {
        to: msg.user_email,
        email: {
          subject: "Account deletion scheduled",
          html: `<p>Your account is scheduled for deletion on <strong>${escapeHtml(date)}</strong>. You can cancel any time before then by signing back in and clicking "Cancel deletion" on the Settings page.</p>`,
          text: `Account deletion scheduled for ${date}. Sign in to cancel.`,
        },
      };
    }
  }
}

export async function handleEmailSend(env: Bindings, msg: EmailMessage): Promise<void> {
  const log = createLogger((env.LOG_LEVEL ?? "info") as LogLevel, {
    queue: "email-send",
    kind: msg.kind,
  });
  if (!env.RESEND_API_KEY) {
    // Dev mode — log and noop.
    log.info("email.skipped_no_resend_key", {
      preview: JSON.stringify(msg).slice(0, 500),
    });
    return;
  }
  if (!env.RESEND_FROM_EMAIL) {
    log.warn("email.skipped_no_from_address");
    return;
  }
  const { to, email } = await render(env, msg);
  const client = new ResendClient({ apiKey: env.RESEND_API_KEY });
  const result = await client.sendEmail({
    from: env.RESEND_FROM_EMAIL,
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    tags: [{ name: "kind", value: msg.kind }],
    idempotencyKey: `${msg.kind}:${"organization_id" in msg ? msg.organization_id : ""}:${
      "to_email" in msg ? msg.to_email : "user_email" in msg ? msg.user_email : ""
    }:${Math.floor(Date.now() / 60_000)}`,
  });
  log.info("email.sent", { resend_id: result.id, to });
}
