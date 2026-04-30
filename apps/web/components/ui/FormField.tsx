import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "./Label";
import { FormError } from "./FormError";

export interface FormFieldProps {
  /** id for label/input wiring. Auto-generated via React.useId() when omitted. */
  id?: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Hand-rolled form field wrapper: label + control slot + inline error.
 * Same naming pattern as the planned shadcn `FormField` so it can be swapped later.
 */
export function FormField({
  id,
  label,
  error,
  hint,
  className,
  children,
}: FormFieldProps) {
  const generatedId = React.useId();
  const fieldId = id ?? generatedId;
  const errorId = error ? `${fieldId}-error` : undefined;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={fieldId}>{label}</Label>
      {React.isValidElement(children)
        ? React.cloneElement(
            children as React.ReactElement<
              React.InputHTMLAttributes<HTMLInputElement> & {
                "aria-invalid"?: boolean;
                "aria-describedby"?: string;
              }
            >,
            {
              id: fieldId,
              "aria-invalid": Boolean(error) || undefined,
              "aria-describedby": describedBy,
            },
          )
        : children}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-ink-subtle">
          {hint}
        </p>
      ) : null}
      <FormError id={errorId} message={error} />
    </div>
  );
}
