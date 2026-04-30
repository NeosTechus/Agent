"use client";

import * as React from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardTitle } from "@/components/ui/Card";

export interface OutcomeSlice {
  outcome: string;
  count: number;
}

const PALETTE = [
  "#4F46E5", // primary
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#6366F1", // indigo-500
  "#06B6D4", // cyan
  "#94A3B8", // slate
];

export interface OutcomesDonutProps {
  data: OutcomeSlice[];
}

/**
 * Right-rail outcomes widget: donut chart + top-3 list. The PRD calls for
 * NLP-extracted intents here, but those aren't surfaced yet — using outcome
 * counts as the V1 surrogate (noted in PRD §7.8.3 task spec).
 */
export function OutcomesDonut({ data }: OutcomesDonutProps) {
  const sorted = React.useMemo(
    () => [...data].sort((a, b) => b.count - a.count).filter((s) => s.count > 0),
    [data],
  );
  const total = sorted.reduce((sum, s) => sum + s.count, 0);

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>Outcomes today</CardTitle>
        <p className="mt-1 text-xs text-ink-muted">
          Breakdown of call results captured today.
        </p>
      </div>

      {total === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-surface px-3 py-6 text-center text-sm text-ink-muted">
          No outcomes yet today.
        </p>
      ) : (
        <>
          <div className="relative h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sorted}
                  dataKey="count"
                  nameKey="outcome"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke="none"
                >
                  {sorted.map((slice, idx) => (
                    <Cell
                      key={slice.outcome}
                      fill={PALETTE[idx % PALETTE.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${value} call${value === 1 ? "" : "s"}`,
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold leading-none text-ink">
                {total}
              </span>
              <span className="mt-1 text-xs text-ink-muted">
                {total === 1 ? "call" : "calls"}
              </span>
            </div>
          </div>

          <ul className="space-y-2">
            {sorted.slice(0, 3).map((slice, idx) => (
              <li
                key={slice.outcome}
                className="flex items-center justify-between text-sm"
              >
                <span className="flex items-center gap-2 text-ink">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: PALETTE[idx % PALETTE.length],
                    }}
                    aria-hidden="true"
                  />
                  <span className="capitalize">{slice.outcome}</span>
                </span>
                <span className="font-medium text-ink-muted">
                  {slice.count}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
