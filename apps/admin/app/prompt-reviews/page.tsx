"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { adminApi } from "@/lib/api";

export default function PromptReviewsPage() {
  const qc = useQueryClient();
  const reviewsQuery = useQuery({
    queryKey: ["admin", "prompt-reviews"],
    queryFn: () => adminApi.promptReviews.list().then((r) => r.reviews),
  });

  const decide = useMutation({
    mutationFn: ({
      id,
      decision,
      reason,
    }: {
      id: string;
      decision: "approve" | "reject";
      reason?: string;
    }) => adminApi.promptReviews.decide(id, decision, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "prompt-reviews"] }),
  });

  const reviews = reviewsQuery.data ?? [];

  return (
    <Shell>
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-white">Prompt reviews</h1>
        <p className="mt-1 text-xs text-slate-400">
          Customer prompt edits flagged by the safety judge as weakening one of:
          legal advice, medical advice, financial advice, inventing facts. Live
          agent stays on the previously-published version until approved or
          rejected.
        </p>
      </header>

      {reviewsQuery.isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-slate-500">
          No pending reviews. Safety judge running clean.
        </p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="rounded border border-amber-700 bg-amber-950/20 p-4"
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {r.organization_name}
                  </p>
                  <p className="text-xs text-slate-400">
                    v{r.version} · submitted{" "}
                    {new Date(r.created_at * 1000).toLocaleString()}
                  </p>
                </div>
                <span className="rounded bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-300">
                  pending review
                </span>
              </div>

              {r.review_reason && (
                <p className="mb-3 rounded bg-slate-900 p-2 text-xs text-amber-300">
                  Judge: {r.review_reason}
                </p>
              )}

              <details className="mb-3">
                <summary className="cursor-pointer text-xs text-slate-300">
                  Show prompt diff
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-xs font-medium text-slate-400">PREVIOUS</p>
                    <pre className="max-h-72 overflow-auto rounded bg-slate-900 p-3 text-xs whitespace-pre-wrap text-slate-300">
                      {r.previous_system_prompt ?? "(no prior published version)"}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-slate-400">PROPOSED</p>
                    <pre className="max-h-72 overflow-auto rounded bg-slate-900 p-3 text-xs whitespace-pre-wrap text-slate-300">
                      {r.system_prompt}
                    </pre>
                  </div>
                </div>
              </details>

              <div className="flex gap-2">
                <button
                  onClick={() =>
                    decide.mutate({ id: r.id, decision: "approve" })
                  }
                  disabled={decide.isPending}
                  className="rounded bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {decide.isPending ? "Working…" : "Approve and publish"}
                </button>
                <button
                  onClick={() => {
                    const reason = prompt("Rejection reason:") ?? undefined;
                    if (reason)
                      decide.mutate({ id: r.id, decision: "reject", reason });
                  }}
                  disabled={decide.isPending}
                  className="rounded bg-red-700 px-3 py-1 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
