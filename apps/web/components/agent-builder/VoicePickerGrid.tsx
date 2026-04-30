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

  if (voices.length === 0) {
    return (
      <p className={cn("text-sm text-ink-muted", className)}>
        No voices available.
      </p>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Voice"
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {voices.map((voice) => {
        const selected = value === voice.id;
        const playing = playingId === voice.id;
        return (
          <div
            key={voice.id}
            className={cn(
              "rounded-md border bg-white p-3 shadow-sm transition-colors",
              selected
                ? "border-primary ring-1 ring-primary/30"
                : "border-border hover:border-slate-300",
            )}
          >
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(voice.id)}
              className="w-full text-left focus:outline-none"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">
                  {voice.name}
                </span>
                {selected ? (
                  <span className="text-xs font-medium text-primary">
                    Selected
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-ink-muted line-clamp-2">
                {voice.description}
              </p>
            </button>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => play(voice)}
                className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-medium text-ink shadow-sm transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {playing ? "Stop" : "Play sample"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
