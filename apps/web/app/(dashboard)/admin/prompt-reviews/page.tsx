"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { adminApi } from "@/lib/admin";

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
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin", "prompt-reviews"] }),
  });

  const reviews = reviewsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-ink">Prompt reviews</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Customer prompt edits flagged by the safety judge as weakening one of:
          legal advice, medical advice, financial advice, inventing facts. Live
          agent stays on the previously-published version until approved or
          rejected.
        </p>
      </header>

      {reviewsQuery.isLoading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No pending reviews. Safety judge running clean.
        </p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-amber-300 bg-amber-50 p-6 shadow-sm"
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {r.organization_name}
                  </p>
                  <p className="text-xs text-ink-muted">
                    v{r.version} · submitted{" "}
                    {new Date(r.created_at * 1000).toLocaleString()}
                  </p>
                </div>
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800">
                  pending review
                </span>
              </div>

              {r.review_reason && (
                <p className="mb-3 rounded-md bg-white p-2 text-xs text-amber-800">
                  Judge: {r.review_reason}
                </p>
              )}

              <details className="mb-3">
                <summary className="cursor-pointer text-xs text-ink">
                  Show prompt diff
                </summary>
                <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-ink-muted">
                      PREVIOUS
                    </p>
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-xs text-ink">
                      {r.previous_system_prompt ?? "(no prior published version)"}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-ink-muted">
                      PROPOSED
                    </p>
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-xs text-ink">
                      {r.system_prompt}
                    </pre>
                  </div>
                </div>
              </details>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    decide.mutate({ id: r.id, decision: "approve" })
                  }
                  disabled={decide.isPending}
                >
                  {decide.isPending ? "Working…" : "Approve and publish"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const reason = prompt("Rejection reason:") ?? undefined;
                    if (reason)
                      decide.mutate({ id: r.id, decision: "reject", reason });
                  }}
                  disabled={decide.isPending}
                >
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
