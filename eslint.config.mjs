import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

const CONSENT_RECORDINGS_RESTRICTIONS = [
  {
    selector: "MemberExpression[property.name='CONSENT_RECORDINGS']",
    message:
      "env.CONSENT_RECORDINGS is allow-listed: only services/voices/** and admin/voice-clones/** may reference it. See env.ts comment + DECISIONS.md before adding a caller.",
  },
  {
    selector: "Identifier[name='CONSENT_RECORDINGS']",
    message:
      "CONSENT_RECORDINGS is allow-listed: only services/voices/** and admin/voice-clones/** may reference it.",
  },
];

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.wrangler/**",
      "**/build/**",
      "**/.open-next/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
  // CONSENT_RECORDINGS allow-list rule (PRD §5.15 + §6.4 7-year retention
  // carve-out). See /docs/DECISIONS.md 2026-04-30 "Day 2 (Row 10) Tier 3"
  // and the comment block on env.ts.
  {
    files: ["apps/api/src/**/*.ts"],
    ignores: [
      "apps/api/src/env.ts",
      "apps/api/src/services/voices/**",
      "apps/api/src/services/admin/voice-clones/**",
      // Tests — not production call paths. The reachability test in
      // services/account/__tests__/cron-carve-out.test.ts is what guards
      // the cron's actual call graph.
      "apps/api/src/**/*.test.ts",
      "apps/api/src/**/__tests__/**",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...CONSENT_RECORDINGS_RESTRICTIONS],
    },
  },
];
