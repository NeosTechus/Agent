"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "bottom";
  className?: string;
}

/**
 * Lightweight CSS-only tooltip — keep the shadcn-style call site
 * (`<Tooltip content="..."><Trigger /></Tooltip>`) so the component can be
 * upgraded to Radix later without touching consumers.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: TooltipProps) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
