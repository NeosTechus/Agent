import type { Config } from "tailwindcss";

/**
 * Stripe-inspired customer-facing design tokens (PRD 7.4.3).
 * Light mode only in V1. Brand details deferred — keep neutrals + a single
 * indigo primary for now.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary accent — Indigo-600 per PRD 7.4.3.
        primary: {
          DEFAULT: "#4F46E5",
          foreground: "#FFFFFF",
          hover: "#4338CA",
        },
        // Surfaces.
        background: "#FFFFFF",
        surface: "#FAFAFA",
        // Text — slate scale per PRD.
        ink: {
          DEFAULT: "#0F172A", // slate-900
          muted: "#475569", // slate-600
          subtle: "#94A3B8", // slate-400
        },
        border: "#E2E8F0", // slate-200
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      fontSize: {
        // Stripe-style scale (PRD 7.4.3: 12, 14, 16, 18, 24, 32).
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["14px", { lineHeight: "20px" }],
        base: ["16px", { lineHeight: "24px" }],
        lg: ["18px", { lineHeight: "28px" }],
        "2xl": ["24px", { lineHeight: "32px" }],
        "4xl": ["32px", { lineHeight: "40px" }],
      },
      maxWidth: {
        content: "1280px",
      },
      borderRadius: {
        md: "6px",
        lg: "8px",
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 1px 0 rgb(15 23 42 / 0.03)",
        md: "0 4px 12px -2px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
