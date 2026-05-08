// msw handlers covering the Resend email API surface.
//
// ResendClient posts to `https://api.resend.com/emails` with a JSON body.
// The mock captures every send call so tests can assert on recipient, subject,
// and body without a real email going out.

import { http, HttpResponse } from "msw";

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------
interface StoredEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  tags?: Array<{ name: string; value: string }>;
  idempotencyKey: string | null;
}

export const resendStore = {
  emails: [] as StoredEmail[],
  nextStatus: 200 as number,
};

export function resetResendStore(): void {
  resendStore.emails = [];
  resendStore.nextStatus = 200;
}

export function setResendStatus(status: number): void {
  resendStore.nextStatus = status;
}

let nextId = 0;
function rand(): string {
  nextId += 1;
  return `re_test_${nextId.toString(16).padStart(8, "0")}`;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
export const resendHandlers = [
  http.post("https://api.resend.com/emails", async ({ request }) => {
    if (resendStore.nextStatus !== 200) {
      const status = resendStore.nextStatus;
      resendStore.nextStatus = 200;
      return HttpResponse.json({ message: "error" }, { status });
    }
    const body = (await request.json()) as {
      from: string;
      to: string[];
      subject: string;
      html?: string;
      text?: string;
      tags?: Array<{ name: string; value: string }>;
    };
    const id = rand();
    resendStore.emails.push({
      id,
      from: body.from,
      to: body.to,
      subject: body.subject,
      html: body.html,
      text: body.text,
      tags: body.tags,
      idempotencyKey: request.headers.get("Idempotency-Key"),
    });
    return HttpResponse.json({ id });
  }),
];
