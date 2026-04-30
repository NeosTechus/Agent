import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}

/**
 * Hand-rolled toggle switch — keeps the shadcn `Switch` API so a future swap
 * is a one-line import change.
 */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  function Switch(
    { checked, onCheckedChange, disabled, id, className, ...aria },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-label={aria["aria-label"]}
        aria-labelledby={aria["aria-labelledby"]}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-primary" : "bg-slate-300",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
    );
  },
);
