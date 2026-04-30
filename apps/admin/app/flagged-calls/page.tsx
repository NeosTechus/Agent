"use client";

import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { adminApi } from "@/lib/api";

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
      adminApi.flaggedCalls().then((r) => r.calls as unknown as FlaggedCallRow[]),
  });

  return (
    <Shell>
      <h1 className="mb-4 text-xl font-semibold">Flagged calls</h1>
      {query.isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <ul className="space-y-3">
          {(query.data ?? []).map((c) => (
            <li key={c.id} className="rounded border border-slate-800 p-4 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium">{c.organization_name}</span>
                <span className="text-xs text-slate-400">
                  {new Date(c.created_at * 1000).toLocaleString()}
                </span>
              </div>
              <p className="mb-2 text-xs text-slate-500">
                {c.duration_seconds}s · {c.outcome ?? "—"} ·{" "}
                {c.quality_score !== null
                  ? `${(c.quality_score * 100).toFixed(0)}% quality`
                  : "no grade"}
              </p>
              {c.transcript && (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-900 p-3 text-xs text-slate-300">
                  {c.transcript}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
