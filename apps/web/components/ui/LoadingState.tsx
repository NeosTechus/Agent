import { cn } from "@/lib/utils";

export interface LoadingStateProps {
  title?: string;
  description?: string;
  /** Number of skeleton rows to render. */
  rows?: number;
  className?: string;
}

/**
 * Loading state per PRD 7.4.6: skeleton screens, not bare spinners.
 * Renders a heading + N skeleton bars matching typical list/card layouts.
 */
export function LoadingState({
  title = "Loading...",
  description,
  rows = 4,
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-white p-6 shadow-sm",
        className,
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        {description ? (
          <p className="text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-4 w-full animate-pulse rounded bg-surface"
            style={{ width: `${100 - i * 8}%` }}
          />
        ))}
      </div>
    </div>
  );
}
