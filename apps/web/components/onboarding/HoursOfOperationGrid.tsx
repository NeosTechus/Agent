"use client";

import * as React from "react";
import { Switch } from "@/components/ui";
import { cn } from "@/lib/utils";

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type DayHours = { open: string; close: string } | null;

export type Hours = Record<DayKey, DayHours>;

export const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

export const DEFAULT_HOURS: Hours = {
  mon: { open: "09:00", close: "17:00" },
  tue: { open: "09:00", close: "17:00" },
  wed: { open: "09:00", close: "17:00" },
  thu: { open: "09:00", close: "17:00" },
  fri: { open: "09:00", close: "17:00" },
  sat: null,
  sun: null,
};

const TIME_RE = /^\d{2}:\d{2}$/;

function isValidDayHours(value: unknown): value is DayHours {
  if (value === null) return true;
  if (typeof value !== "object" || value === null) return false;
  const v = value as { open?: unknown; close?: unknown };
  return (
    typeof v.open === "string" &&
    typeof v.close === "string" &&
    TIME_RE.test(v.open) &&
    TIME_RE.test(v.close)
  );
}

/**
 * Parse a JSON string from `business.hours_json` into an `Hours` shape.
 * Falls back to {@link DEFAULT_HOURS} on any parse / shape error.
 */
export function parseHoursJson(raw: string | null | undefined): Hours {
  if (!raw) return { ...DEFAULT_HOURS };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_HOURS };
    const out: Hours = { ...DEFAULT_HOURS };
    for (const { key } of DAYS) {
      const v = (parsed as Record<string, unknown>)[key];
      if (v === undefined) continue;
      if (isValidDayHours(v)) {
        out[key] = v;
      } else {
        return { ...DEFAULT_HOURS };
      }
    }
    return out;
  } catch {
    return { ...DEFAULT_HOURS };
  }
}

export interface HoursValidationError {
  day: DayKey;
  label: string;
  message: string;
}

/**
 * Validate hours: open must be strictly less than close for non-closed days.
 * Returns the first error found, or null if all rows are valid.
 */
export function validateHours(hours: Hours): HoursValidationError | null {
  for (const { key, label } of DAYS) {
    const row = hours[key];
    if (row === null) continue;
    if (row.open >= row.close) {
      return {
        day: key,
        label,
        message: `${label} close time must be after open time`,
      };
    }
  }
  return null;
}

export function allDaysClosed(hours: Hours): boolean {
  return DAYS.every(({ key }) => hours[key] === null);
}

export interface HoursOfOperationGridProps {
  value: Hours;
  onChange: (next: Hours) => void;
}

export function HoursOfOperationGrid({ value, onChange }: HoursOfOperationGridProps) {
  const setDay = (key: DayKey, next: DayHours) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="grid grid-cols-[6.5rem_4.5rem_1fr_1fr] items-center gap-3 border-b border-slate-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
        <span>Day</span>
        <span>Closed</span>
        <span>Open</span>
        <span>Close</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {DAYS.map(({ key, label }) => {
          const row = value[key];
          const closed = row === null;
          const open = row?.open ?? "09:00";
          const close = row?.close ?? "17:00";
          return (
            <li
              key={key}
              className="grid grid-cols-[6.5rem_4.5rem_1fr_1fr] items-center gap-3 px-4 py-2.5"
            >
              <span className="text-sm font-medium text-ink">{label}</span>
              <Switch
                aria-label={`${label} closed`}
                checked={closed}
                onCheckedChange={(next) =>
                  setDay(key, next ? null : { open: "09:00", close: "17:00" })
                }
              />
              <input
                type="time"
                aria-label={`${label} open time`}
                value={open}
                disabled={closed}
                onChange={(e) =>
                  setDay(key, { open: e.target.value, close: row?.close ?? "17:00" })
                }
                className={cn(
                  "block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm",
                  closed && "cursor-not-allowed bg-slate-50 text-slate-400",
                )}
              />
              <input
                type="time"
                aria-label={`${label} close time`}
                value={close}
                disabled={closed}
                onChange={(e) =>
                  setDay(key, { open: row?.open ?? "09:00", close: e.target.value })
                }
                className={cn(
                  "block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm",
                  closed && "cursor-not-allowed bg-slate-50 text-slate-400",
                )}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
