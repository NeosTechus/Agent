"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/admin";

interface FlaggedCallRow {
  id: string;
  organization_id: string;
  organization_name: string;
  created_at: number;
  duration_seconds: number;
  outcome: string | null;
  transcript: string | null;
  recording_r2_url: string | null;
  quality_score: number | null;
}

export default function FlaggedCallsPage() {
  const query = useQuery({
    queryKey: ["admin", "flagged-calls"],
    queryFn: () =>
      adminApi
        .flaggedCalls()
        .then((r) => r.calls as unknown as FlaggedCallRow[]),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-ink">Flagged calls</h2>

      {query.isLoading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : (
        <ul className="space-y-3">
          {(query.data ?? []).map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-border bg-white p-6 text-sm shadow-sm"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-ink">
                  {c.organization_name}
                </span>
                <span className="text-xs text-ink-muted">
                  {new Date(c.created_at * 1000).toLocaleString()}
                </span>
              </div>
              <p className="mb-2 text-xs text-ink-muted">
                {c.duration_seconds}s · {c.outcome ?? "—"} ·{" "}
                {c.quality_score !== null
                  ? `${(c.quality_score * 100).toFixed(0)}% quality`
                  : "no grade"}
              </p>
              {c.transcript && (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-surface p-3 text-xs text-ink">
                  {c.transcript}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
