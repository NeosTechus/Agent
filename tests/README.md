# Tests

QA Agent surface — owns `/tests` and `__tests__/` folders next to source.
See `.claude/agents/qa.md` for the full charter.

> **Always run via `pnpm test`, `pnpm test:coverage`, or `pnpm test:integration` — never `pnpm vitest` directly. Running vitest directly skips `setupFiles` and msw never starts, causing all mocked-fetch tests to fail with unexpected 500s.**

## Layout

```
tests/
├── setup.ts               # global vitest setup (msw lifecycle + faker reset)
├── tsconfig.json          # extends tsconfig.base, includes apps + tests
├── vitest.config.ts       # workspace-aware vitest config + coverage thresholds
├── playwright.config.ts   # playwright config (baseURL, single chromium)
├── factories/             # @faker-js/faker factories with deterministic seed
├── mocks/
│   ├── server.ts          # msw setupServer (Node — Vitest)
│   ├── browser.ts         # page.route helpers (Playwright)
│   └── stripe.ts          # Stripe REST handlers (customers, checkout, etc.)
├── integration/           # Hono `app.fetch()` integration suites
│   ├── _harness.ts        # in-memory D1 + KV stand-ins, app composer
│   ├── auth.test.ts
│   └── billing.test.ts
└── e2e/
    └── signup-and-pay.spec.ts   # Phase 2 exit criterion (currently .skip)
```

Unit tests live next to the source as `__tests__/<file>.test.ts`. Today:

- `apps/api/src/services/auth/__tests__/logic.test.ts`
- `apps/api/src/services/billing/__tests__/logic.test.ts`
- `apps/api/src/integrations/shared/__tests__/signature.test.ts`
- `apps/web/lib/__tests__/plans.test.ts`

## Commands

```bash
# Unit + integration (Vitest)
pnpm test                  # runs everything in this repo's vitest config
pnpm test:integration      # alias — same suite, kept for clarity in CI
pnpm test:coverage         # adds c8/v8 coverage, writes ./tests/coverage

# End-to-end (Playwright)
pnpm test:e2e              # runs tests/e2e/**/*.spec.ts
```

The Playwright e2e is currently `.skip`'d — see header comment in
`tests/e2e/signup-and-pay.spec.ts` for the un-skip checklist.

## Adding a new factory

1. Create `tests/factories/<name>.ts`. Read the corresponding Drizzle
   schema (`packages/db/schema/<table>.ts`) for the field shape.
2. Use `import { faker } from './seed'` — never import faker directly,
   that imports an unseeded singleton.
3. Export a `create<Name>Factory({ overrides })` function.
4. Re-export from `tests/factories/index.ts`.

## Adding a new msw handler

1. Add to `tests/mocks/<service>.ts` (e.g. `vapi.ts`, `twilio.ts`).
2. Register the handler array in `tests/mocks/server.ts`.
3. If the surface is also exercised by Playwright, mirror the handler in
   `tests/mocks/browser.ts` using `page.route()`.

## Coverage thresholds

Set in `vitest.config.ts` per qa.md:

| Path                                 | Lines |
| ------------------------------------ | ----- |
| `apps/api/src/services/auth/**`      | 100%  |
| `apps/api/src/services/billing/**`   | 100%  |
| `apps/api/src/**`                    | 70%   |
| `apps/web/**`                        | 50%   |

## Notes / gotchas

- The integration harness uses an in-memory D1 stand-in that recognizes
  only the SQL the auth + billing services emit. Unrecognized queries
  throw `TODO(test-infra): unrecognized …` so writes to new tables are
  flagged loudly. Real D1 binding wiring is a Phase 3 task.
- `onUnhandledRequest: 'error'` — any test that hits an unmocked URL
  fails. Add a handler rather than relaxing the global setting.
- Tests must be deterministic. Use `faker` from `tests/factories/seed.ts`,
  and prefer injected `now`s over `Date.now()` for time-sensitive paths.
