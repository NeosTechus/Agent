"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { Voice } from "@/lib/agents-types";

export interface VoicePickerGridProps {
  voices: Voice[];
  value: string | null;
  onChange: (voiceId: string) => void;
  className?: string;
}

/**
 * Grid of voice cards. Single-instance audio playback — picking a new sample
 * pauses any sample currently playing (per Day 9 spec).
 */
export function VoicePickerGrid({
  voices,
  value,
  onChange,
  className,
}: VoicePickerGridProps) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = React.useState<string | null>(null);

  const stop = React.useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlayingId(null);
  }, []);

  const play = React.useCallback(
    (voice: Voice) => {
      if (playingId === voice.id) {
        stop();
        return;
      }
      if (!voice.sample_url) {
        // No preview audio available for this voice — silent no-op rather
        // than constructing an Audio with `undefined` src (which fails
        // silently and looks broken).
        return;
      }
      stop();
      const a = new Audio(voice.sample_url);
      audioRef.current = a;
      a.onended = () => setPlayingId(null);
      void a.play().catch(() => setPlayingId(null));
      setPlayingId(voice.id);
    },
    [playingId, stop],
  );

  React.useEffect(() => () => stop(), [stop]);

  const [search, setSearch] = React.useState("");
  const [expanded, setExpanded] = React.useState(false);

  // Always include the currently-selected voice in the default 8, even if
  // it would otherwise be off-screen. Keeps "your current pick" reachable
  // without forcing the user to expand.
  const DEFAULT_VISIBLE = 8;
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return voices;
    return voices.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.description ?? "").toLowerCase().includes(q),
    );
  }, [voices, search]);

  const showAll = expanded || search.trim().length > 0;
  const visible = React.useMemo(() => {
    if (showAll) return filtered;
    const head = filtered.slice(0, DEFAULT_VISIBLE);
    if (value && !head.some((v) => v.id === value)) {
      const sel = filtered.find((v) => v.id === value);
      if (sel) return [sel, ...head.slice(0, DEFAULT_VISIBLE - 1)];
    }
    return head;
  }, [filtered, showAll, value]);

  if (voices.length === 0) {
    return (
      <p className={cn("text-sm text-ink-muted", className)}>
        No voices available.
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {showAll ? (
        <div className="flex items-center justify-between gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search voices…"
            className="h-9 w-full max-w-xs rounded-md border border-border bg-white px-3 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
          <p className="hidden text-xs text-ink-muted sm:block">
            {filtered.length} of {voices.length}
          </p>
        </div>
      ) : null}
    <div
      role="radiogroup"
      aria-label="Voice"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      {visible.map((voice) => {
        const selected = value === voice.id;
        const playing = playingId === voice.id;
        return (
          <div
            key={voice.id}
            onClick={() => onChange(voice.id)}
            role="radio"
            aria-checked={selected}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange(voice.id);
              }
            }}
            className={cn(
              // Fixed-height card so all voices line up regardless of text length.
              "group relative flex h-[7.5rem] cursor-pointer flex-col rounded-md border bg-white p-3 shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              selected
                ? "border-primary ring-1 ring-primary/30"
                : "border-border hover:border-slate-300",
            )}
          >
            {/* Selection indicator — small absolute checkmark, doesn't steal name width */}
            {selected ? (
              <span
                aria-hidden="true"
                className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white shadow"
              >
                ✓
              </span>
            ) : null}

            {/* Name — uniform size, wraps to 2 lines if long, never mid-word truncates */}
            <p
              className={cn(
                "text-sm font-semibold leading-tight text-ink line-clamp-2",
                selected ? "pr-7" : "",
              )}
            >
              {voice.name}
            </p>
            {/* Description — uniform size, 1-line clamp to keep heights identical */}
            <p className="mt-1 text-xs leading-snug text-ink-muted line-clamp-1">
              {voice.description || "—"}
            </p>

            {/* Play button pinned to bottom via mt-auto so cards align */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                play(voice);
              }}
              disabled={!voice.sample_url}
              aria-label={
                voice.sample_url
                  ? playing
                    ? "Stop sample"
                    : "Play sample"
                  : "Sample unavailable"
              }
              className="mt-auto inline-flex h-7 w-fit items-center gap-1.5 rounded-md border border-border bg-white px-2.5 text-[11px] font-medium text-ink shadow-sm transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden="true">{!voice.sample_url ? "—" : playing ? "■" : "▶"}</span>
              {!voice.sample_url ? "No preview" : playing ? "Stop" : "Play"}
            </button>
          </div>
        );
      })}
      {filtered.length === 0 ? (
        <p className="col-span-full text-sm text-ink-muted">
          No voices match &quot;{search}&quot;.
        </p>
      ) : null}
    </div>

    {/* Expand / collapse trigger — only shown when there are more voices to load */}
    {!showAll && filtered.length > DEFAULT_VISIBLE ? (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-md border border-dashed border-slate-300 bg-white py-2 text-xs font-medium text-ink-muted transition-colors hover:border-slate-400 hover:text-ink"
      >
        Show all {filtered.length} voices ↓
      </button>
    ) : null}
    {showAll && !search.trim() && filtered.length > DEFAULT_VISIBLE ? (
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="w-full rounded-md border border-dashed border-slate-300 bg-white py-2 text-xs font-medium text-ink-muted transition-colors hover:border-slate-400 hover:text-ink"
      >
        Show fewer voices ↑
      </button>
    ) : null}
    </div>
  );
}
