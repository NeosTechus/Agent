"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import type { AgentVersion } from "@/lib/agents-types";

export interface VersionListProps {
  versions: AgentVersion[];
  /** ID of the currently-loaded (active in editor) version. */
  activeId?: string;
  onRollback: (version: AgentVersion) => void;
  isRollingBack?: boolean;
  className?: string;
}

function formatTimestamp(seconds: number): string {
  const d = new Date(seconds * 1000);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function VersionList({
  versions,
  activeId,
  onRollback,
  isRollingBack,
  className,
}: VersionListProps) {
  if (versions.length === 0) {
    return (
      <div className={cn("text-sm text-ink-muted", className)}>
        No version history yet. Save a draft to start building history.
      </div>
    );
  }
  return (
    <ol className={cn("space-y-2", className)}>
      {versions.map((v) => {
        const isActive = v.id === activeId;
        const label = v.is_published
          ? "Published"
          : v.is_draft
          ? "Draft"
          : `v${v.version}`;
        return (
          <li
            key={v.id}
            className={cn(
              "rounded-md border bg-white p-3 shadow-sm transition-colors",
              isActive
                ? "border-primary ring-1 ring-primary/30"
                : "border-border",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      v.is_published
                        ? "bg-emerald-50 text-emerald-700"
                        : v.is_draft
                        ? "bg-amber-50 text-amber-700"
                        : "bg-slate-100 text-slate-700",
                    )}
                  >
                    {label}
                  </span>
                  <span className="text-xs text-ink-subtle">
                    v{v.version}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-ink-muted">
                  {formatTimestamp(v.created_at)}
                </p>
              </div>
            </div>
            {!v.is_draft && !v.is_published ? (
              <div className="mt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isRollingBack}
                  onClick={() => onRollback(v)}
                >
                  Roll back
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
