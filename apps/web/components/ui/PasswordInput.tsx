"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input, type InputProps } from "./Input";

/**
 * Password input with a show/hide toggle. Drop-in replacement for `<Input
 * type="password" />` — used by signup, login, and reset-password forms.
 *
 * Defaults to obscured (type=password). Clicking the eye icon flips to
 * type=text so the user can verify what they typed. Aria label updates on
 * toggle so screen readers announce the new state.
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<InputProps, "type">
>(function PasswordInput({ className, ...props }, ref) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        // Right-pad to make room for the toggle button.
        className={cn("pr-10", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        tabIndex={-1}
        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    </div>
  );
});
