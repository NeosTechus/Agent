"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { adminApi } from "@/lib/api";

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
      adminApi.voiceClones.list().then((r) => r.requests as unknown as VoiceCloneRequest[]),
  });

  const review = useMutation({
    mutationFn: (vars: { request_id: string; decision: "approve" | "reject"; reason?: string }) =>
      adminApi.voiceClones.review(vars.request_id, vars.decision, vars.reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "voice-clones"] }),
  });

  return (
    <Shell>
      <h1 className="mb-4 text-xl font-semibold">Voice clone queue</h1>
      {requestsQuery.isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <ul className="space-y-3">
          {(requestsQuery.data ?? []).map((r) => (
            <li key={r.id} className="rounded border border-slate-800 p-4 text-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs text-slate-400">{r.id}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    r.status === "pending"
                      ? "bg-amber-900/40 text-amber-300"
                      : r.status === "approved"
                      ? "bg-emerald-900/40 text-emerald-300"
                      : "bg-red-900/40 text-red-300"
                  }`}
                >
                  {r.status}
                </span>
              </div>
              <p className="text-slate-300">Org: {r.organization_id}</p>
              <p className="mb-2 text-xs text-slate-500">
                Submitted {new Date(r.created_at * 1000).toLocaleString()}
              </p>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <a
                  href={r.sample_r2_url}
                  className="text-indigo-400 hover:text-indigo-300"
                  target="_blank"
                  rel="noreferrer"
                >
                  Listen to sample
                </a>
                <a
                  href={r.consent_recording_r2_url}
                  className="text-indigo-400 hover:text-indigo-300"
                  target="_blank"
                  rel="noreferrer"
                >
                  Listen to consent
                </a>
              </div>
              {r.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      review.mutate({ request_id: r.id, decision: "approve" })
                    }
                    className="rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-500"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt("Rejection reason:") ?? undefined;
                      if (reason) review.mutate({ request_id: r.id, decision: "reject", reason });
                    }}
                    className="rounded bg-red-700 px-3 py-1 text-xs text-white hover:bg-red-600"
                  >
                    Reject
                  </button>
                </div>
              )}
              {r.rejection_reason && (
                <p className="mt-2 text-xs text-red-300">Reason: {r.rejection_reason}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
