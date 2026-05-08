"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { adminApi } from "@/lib/admin";

interface VoiceCloneRequest {
  id: string;
  organization_id: string;
  sample_r2_url: string;
  consent_recording_r2_url: string;
  status: string;
  created_at: number;
  rejection_reason: string | null;
  elevenlabs_voice_id: string | null;
}

export default function VoiceClonesPage() {
  const qc = useQueryClient();
  const requestsQuery = useQuery({
    queryKey: ["admin", "voice-clones"],
    queryFn: () =>
      adminApi.voiceClones
        .list()
        .then((r) => r.requests as unknown as VoiceCloneRequest[]),
  });

  const review = useMutation({
    mutationFn: (vars: {
      request_id: string;
      decision: "approve" | "reject";
      reason?: string;
    }) =>
      adminApi.voiceClones.review(vars.request_id, vars.decision, vars.reason),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin", "voice-clones"] }),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-ink">Voice clone queue</h2>

      {requestsQuery.isLoading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : (
        <ul className="space-y-3">
          {(requestsQuery.data ?? []).map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-border bg-white p-6 text-sm shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs text-ink-muted">{r.id}</span>
                <StatusPill status={r.status} />
              </div>
              <p className="text-ink">Org: {r.organization_id}</p>
              <p className="mb-2 text-xs text-ink-muted">
                Submitted {new Date(r.created_at * 1000).toLocaleString()}
              </p>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <a
                  href={r.sample_r2_url}
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Listen to sample
                </a>
                <a
                  href={r.consent_recording_r2_url}
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Listen to consent
                </a>
              </div>
              {r.status === "pending" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      review.mutate({ request_id: r.id, decision: "approve" })
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const reason = prompt("Rejection reason:") ?? undefined;
                      if (reason)
                        review.mutate({
                          request_id: r.id,
                          decision: "reject",
                          reason,
                        });
                    }}
                  >
                    Reject
                  </Button>
                </div>
              )}
              {r.rejection_reason && (
                <p className="mt-2 text-xs text-red-600">
                  Reason: {r.rejection_reason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles =
    status === "pending"
      ? "bg-amber-100 text-amber-700"
      : status === "approved"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-red-100 text-red-700";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}
    >
      {status}
    </span>
  );
}
