import * as React from "react";
import { cn } from "@/lib/utils";

export interface FormErrorProps {
  id?: string;
  message?: string;
  className?: string;
}

export function FormError({ id, message, className }: FormErrorProps) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className={cn("text-xs font-medium text-red-600", className)}
    >
      {message}
    </p>
  );
}
