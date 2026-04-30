"use client";

import * as React from "react";
import { Switch } from "@/components/ui";
import type { Capabilities } from "@/lib/agents-types";

interface CapabilityRow {
  key: keyof Capabilities;
  label: string;
  description: string;
}

const ROWS: CapabilityRow[] = [
  {
    key: "take_reservations",
    label: "Take Reservations",
    description: "Let callers book a reservation or appointment.",
  },
  {
    key: "take_orders",
    label: "Take Orders",
    description: "Capture take-out / pickup orders over the phone.",
  },
  {
    key: "answer_menu_questions",
    label: "Answer Menu Questions",
    description: "Use uploaded menu / service info to answer caller questions.",
  },
  {
    key: "transfer_to_human",
    label: "Transfer to Human",
    description: "Route urgent or out-of-scope calls to a live person.",
  },
  {
    key: "take_messages",
    label: "Take Messages",
    description: "Capture name + callback number when no one is available.",
  },
];

export interface CapabilityTogglesProps {
  value: Capabilities;
  onChange: (next: Capabilities) => void;
  disabled?: boolean;
}

export function CapabilityToggles({
  value,
  onChange,
  disabled,
}: CapabilityTogglesProps) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-white shadow-sm">
      {ROWS.map((row) => {
        const id = `cap-${row.key}`;
        const checked = value[row.key];
        return (
          <li
            key={row.key}
            className="flex items-start justify-between gap-4 px-4 py-3"
          >
            <div className="min-w-0">
              <label
                htmlFor={id}
                className="block text-sm font-medium text-ink"
              >
                {row.label}
              </label>
              <p className="mt-0.5 text-xs text-ink-muted">
                {row.description}
              </p>
            </div>
            <Switch
              id={id}
              checked={checked}
              disabled={disabled}
              onCheckedChange={(next) =>
                onChange({ ...value, [row.key]: next })
              }
              aria-label={row.label}
            />
          </li>
        );
      })}
    </ul>
  );
}
