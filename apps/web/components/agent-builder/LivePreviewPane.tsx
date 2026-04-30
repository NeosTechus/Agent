"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { Capabilities } from "@/lib/agents-types";

export interface LivePreviewPaneProps {
  businessName: string;
  firstMessage: string;
  capabilities: Capabilities;
  className?: string;
}

interface Exchange {
  caller: string;
  agent: string;
}

function buildExchanges(
  businessName: string,
  caps: Capabilities,
): Exchange[] {
  const name = businessName || "the business";
  const ex: Exchange[] = [
    {
      caller: "What time do you open?",
      agent: `Let me check — ${name}'s hours are listed in the knowledge base. Want me to read them off, or take a message for the team?`,
    },
    {
      caller: "Do you have parking?",
      agent: caps.answer_menu_questions
        ? `Sure — I can answer parking and location questions from what ${name} has shared with me.`
        : `I'd want to make sure I get that right. Let me take your name and number and have someone from ${name} call you back.`,
    },
    {
      caller: "Can I book a table for 4?",
      agent: caps.take_reservations
        ? `Of course! For four people — what day and time were you thinking?`
        : caps.take_messages
        ? `I'm not able to book directly, but I can take your details and have ${name} call you to confirm.`
        : `${name} doesn't take bookings over the phone, but I'm happy to help with anything else.`,
    },
  ];
  return ex;
}

function applyVariables(text: string, businessName: string): string {
  return text.replaceAll("{{business_name}}", businessName || "the business");
}

export function LivePreviewPane({
  businessName,
  firstMessage,
  capabilities,
  className,
}: LivePreviewPaneProps) {
  const intro = applyVariables(firstMessage, businessName);
  const exchanges = buildExchanges(businessName, capabilities);
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Live preview</h3>
        <span className="text-xs font-medium text-ink-subtle">(simulated)</span>
      </div>
      <div className="rounded-md border border-border bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
          Greeting
        </p>
        <p className="mt-1 text-sm text-ink">{intro}</p>
      </div>
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
          Sample exchanges
        </p>
        {exchanges.map((ex, i) => (
          <div
            key={i}
            className="space-y-2 rounded-md border border-border bg-white p-3 shadow-sm"
          >
            <p className="text-xs font-medium text-ink-muted">Caller</p>
            <p className="text-sm text-ink">{ex.caller}</p>
            <p className="text-xs font-medium text-primary">Agent</p>
            <p className="text-sm text-ink">{ex.agent}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-subtle">
        Preview is illustrative only — your live agent will use uploaded
        knowledge, real availability, and the system prompt above.
      </p>
    </div>
  );
}
