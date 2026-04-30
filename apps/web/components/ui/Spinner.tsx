import { cn } from "@/lib/utils";

export interface SpinnerProps {
  className?: string;
  size?: number;
  label?: string;
}

/**
 * Minimal accessible spinner. Use sparingly — prefer skeleton screens
 * for full-page loading per PRD 7.4.6. Suitable for inline / button states.
 */
export function Spinner({ className, size = 20, label = "Loading" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-block", className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full animate-spin text-ink-subtle"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
          className="opacity-25"
        />
        <path
          d="M22 12a10 10 0 0 1-10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="opacity-75"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
