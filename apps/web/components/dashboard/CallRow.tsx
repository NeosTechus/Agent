"use client";

import * as React from "react";
import Link from "next/link";
import { Flag, Play, Square } from "lucide-react";
import type { Call } from "@/lib/calls";
import { recordingUrl } from "@/lib/calls";
import { formatPhone } from "@/lib/utils";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-xs text-ink-subtle">—</span>;
  const tone =
    outcome === "booked"
      ? "bg-emerald-50 text-emerald-700"
      : outcome === "transferred" || outcome === "escalated"
        ? "bg-amber-50 text-amber-800"
        : outcome === "voicemail"
          ? "bg-slate-100 text-slate-700"
          : outcome === "dropped"
            ? "bg-red-50 text-red-700"
            : "bg-slate-50 text-slate-700";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone}`}>
      {outcome}
    </span>
  );
}

export interface CallRowProps {
  call: Call;
}

/**
 * Single timeline row. Shows the caller, time, outcome, a transcript preview,
 * and toggles a 32px-tall inline `<audio>` player when the listen button is
 * pressed.
 */
export function CallRow({ call }: CallRowProps) {
  const [audioOpen, setAudioOpen] = React.useState(false);

  const transcriptPreview = React.useMemo(() => {
    const t = call.transcript ?? "";
    const collapsed = t.replace(/\s+/g, " ").trim();
    if (collapsed.length === 0) return null;
    if (collapsed.length <= 80) return collapsed;
    return `${collapsed.slice(0, 80)}…`;
  }, [call.transcript]);

  const hasRecording = Boolean(call.recording_r2_url);

  return (
    <div className="group flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0 hover:bg-surface md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium text-ink">
            {formatPhone(call.phone_number)}
          </span>
          <span className="text-ink-muted">
            {formatDuration(call.duration_seconds)}
          </span>
          <span className="text-ink-muted">
            {formatTime(call.created_at)}
          </span>
          <OutcomeBadge outcome={call.outcome} />
          {call.flagged ? (
            <span className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              <Flag className="h-3 w-3" aria-hidden="true" />
              flagged
            </span>
          ) : null}
        </div>
        {transcriptPreview ? (
          <p className="truncate text-sm text-ink-muted">
            {transcriptPreview}
          </p>
        ) : (
          <p className="text-sm italic text-ink-subtle">No transcript yet</p>
        )}
        {audioOpen && hasRecording ? (
          <audio
            controls
            preload="none"
            src={recordingUrl(call.id)}
            className="mt-1 h-8 w-full max-w-md"
          >
            <track kind="captions" />
          </audio>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setAudioOpen((v) => !v)}
          disabled={!hasRecording}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-white px-3 text-xs font-medium text-ink shadow-sm transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          aria-pressed={audioOpen}
          aria-label={audioOpen ? "Hide audio" : "Listen to recording"}
        >
          {audioOpen ? (
            <Square className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Play className="h-3 w-3" aria-hidden="true" />
          )}
          {audioOpen ? "Hide" : "Listen"}
        </button>
        <Link
          href={`/calls/${call.id}`}
          className="text-xs font-medium text-primary hover:text-primary-hover"
        >
          View details →
        </Link>
      </div>
    </div>
  );
}
