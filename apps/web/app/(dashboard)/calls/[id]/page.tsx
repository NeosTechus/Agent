"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Card,
  ErrorState,
  LoadingState,
} from "@/components/ui";
import { queryKeys } from "@/lib/query-keys";
import { flagCall, getCall, recordingUrl } from "@/lib/calls";

function formatTimestamp(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default function CallDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();

  const callQuery = useQuery({
    queryKey: queryKeys.calls.byId(id),
    queryFn: () => getCall(id).then((r) => r.call),
  });

  const flagMutation = useMutation({
    mutationFn: () => flagCall(id),
    onSuccess: ({ call }) => {
      qc.setQueryData(queryKeys.calls.byId(id), call);
      toast.success("Call flagged");
    },
    onError: (e) => toast.error((e as Error).message ?? "Flag failed"),
  });

  if (callQuery.isLoading) return <LoadingState title="Loading call…" />;
  if (callQuery.isError || !callQuery.data) {
    return (
      <ErrorState
        title="Could not load call"
        description={(callQuery.error as Error | undefined)?.message ?? "Try again."}
      />
    );
  }

  const call = callQuery.data;
  const transcriptParas =
    call.transcript?.split(/\n+/).filter((line) => line.trim().length > 0) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/calls" className="text-sm text-ink-muted hover:text-ink">
          ← Back to calls
        </Link>
        <div className="mt-2 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink">
              {call.phone_number ?? "Unknown caller"}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {formatTimestamp(call.created_at)} · {formatDuration(call.duration_seconds)} ·{" "}
              {call.direction}
              {call.is_test ? " · test" : ""}
            </p>
          </div>
          <Button
            variant={call.flagged ? "secondary" : "primary"}
            onClick={() => flagMutation.mutate()}
            disabled={call.flagged || flagMutation.isPending}
          >
            {call.flagged ? "Flagged" : "Flag this call"}
          </Button>
        </div>
      </div>

      {call.recording_r2_url ? (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-medium text-ink">Recording</h2>
          <audio controls preload="none" className="w-full" src={recordingUrl(call.id)}>
            Your browser does not support audio playback.
          </audio>
        </Card>
      ) : (
        <Card className="p-4 text-sm text-ink-muted">
          Recording not yet available — it usually appears within a minute of the call ending.
        </Card>
      )}

      <Card className="p-6">
        <h2 className="mb-3 text-sm font-medium text-ink">Transcript</h2>
        {transcriptParas.length > 0 ? (
          <div className="space-y-3 whitespace-pre-wrap text-sm leading-6 text-ink">
            {transcriptParas.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">No transcript yet.</p>
        )}
      </Card>

      <Card className="p-4 text-xs text-ink-muted">
        Outcome: {call.outcome ?? "—"} · Cost: ${(call.cost_cents / 100).toFixed(2)}
        {call.quality_score !== null
          ? ` · Quality: ${(call.quality_score * 100).toFixed(0)}%`
          : ""}
      </Card>
    </div>
  );
}
