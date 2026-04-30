import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names — `clsx` for conditional logic,
 * `tailwind-merge` to dedupe conflicting utilities.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format an E.164 phone number for display.
 * Examples:
 *   "+15555550100" -> "(555) 555-0100"
 *   "+442071838750" -> "+44 20 7183 8750"
 *   null/invalid    -> "Unknown"
 */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "Unknown";
  const digits = e164.replace(/[^\d]/g, "");
  // US/Canada: +1 followed by 10 digits (or 10 digits without country code)
  if (e164.startsWith("+1") && digits.length === 11) {
    const area = digits.slice(1, 4);
    const prefix = digits.slice(4, 7);
    const line = digits.slice(7, 11);
    return `(${area}) ${prefix}-${line}`;
  }
  if (digits.length === 10 && !e164.startsWith("+")) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  // Other countries — best-effort grouping
  if (e164.startsWith("+")) {
    return e164;
  }
  return e164;
}
