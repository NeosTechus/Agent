# Claude Code Sub-Agents

This folder defines specialized AI sub-agents that Claude Code uses to build the AI Receptionist platform. Each `.md` file is a sub-agent definition — Claude Code reads these and dispatches work to the right specialist.

## How it works

When you (the founder) open this repo in VS Code with Claude Code installed:

1. Claude Code reads `/docs/PRD.md` (the full product requirements)
2. Claude Code acts as the **orchestrator**
3. For any task, the orchestrator identifies which sub-agent owns the work
4. Orchestrator dispatches to the specialist via the Task tool
5. Specialist works in its own context, produces output
6. Orchestrator integrates, runs tests, commits

You stay at the strategic level — review PRs, answer blocking questions, approve merges.

## The seven sub-agents

| File | Owns |
|---|---|
| `frontend.md` | Customer-facing UI (`/apps/web`) — marketing site, dashboard, onboarding, agent builder |
| `backend.md` | API endpoints, business logic, webhooks (`/apps/api`) |
| `database.md` | Schema, migrations, queries (`/packages/db`) |
| `integrations.md` | External APIs (`/apps/api/src/integrations/`) — Vapi, ElevenLabs, Twilio, Stripe, etc. |
| `devops.md` | Deployment, CI/CD, Cloudflare config (`wrangler.toml`, `.github/workflows`) |
| `qa.md` | All testing (`/tests`) — unit, integration, e2e |
| `admin.md` | Internal admin tool (`/apps/admin`) — customer management, support tools |

## Bootstrap procedure (Day 1)

When you first open this repo with Claude Code, paste this prompt to begin:

```
Read /docs/PRD.md end-to-end. This document is your task brief and includes Section 0 with orchestration instructions.

Then begin Day 1 of the build by:

1. Setting up the monorepo structure described in Section 9.6 of the PRD (apps/web, apps/api, apps/admin, packages/db, packages/types)
2. Creating /docs/API.md, /docs/SCHEMA.md, /docs/INTEGRATIONS.md, /docs/DEPLOYMENT.md, /docs/PROGRESS.md, /docs/DECISIONS.md as initial empty files
3. Initializing wrangler.toml for all 4 environments (local, preview, staging, production) — DevOps Agent handles this
4. Creating the database schema from Section 7.2 — Database Agent handles this
5. Setting up the Hono app skeleton — Backend Agent handles this
6. Setting up the Next.js app skeletons (customer + admin) — Frontend Agent and Admin Tool Agent handle these

Phase 1 exit criterion: Hello-world deploys work end-to-end across all environments. Database has all tables. CI passes.

If you hit any Tier 3 ambiguity (Section 9.11 of PRD), pause and ask. Otherwise, keep building. Update /docs/PROGRESS.md as you complete milestones.
```

After Phase 1, follow the build order in PRD Section 9.9 through Phases 2-7.

## How sub-agents communicate

**Sub-agents do NOT talk to each other directly.** They communicate only through:

1. **Committed files** — code, schemas, types, docs all in Git
2. **The orchestrator** — Claude Code's main session that read this README

When a sub-agent needs work from another sub-agent (e.g., Frontend Agent needs a new API endpoint), the sub-agent writes a clear note in its PR description. The orchestrator reads it and dispatches the next agent.

## Ambiguity resolution

When a sub-agent is unsure, follow PRD Section 9.11:

- **Tier 1 (decide yourself):** Naming, code organization, minor UI details, refactoring → just do it, document briefly
- **Tier 2 (decide and document):** Technical implementation choices, non-critical features → make the call, document rationale in `/docs/DECISIONS.md`
- **Tier 3 (stop and ask):** Pricing, customer-facing copy, conflicting requirements, credentials needed, architectural challenges → tag founder, continue on other tasks

## Documentation sub-agents must keep up to date

Every sub-agent has documentation responsibilities. As you build, maintain:

- `/docs/PROGRESS.md` — orchestrator updates after every milestone
- `/docs/API.md` — Backend Agent updates with every endpoint change
- `/docs/SCHEMA.md` — Database Agent updates with every schema change
- `/docs/INTEGRATIONS.md` — Voice/Integration Agent documents external API quirks
- `/docs/DEPLOYMENT.md` — DevOps Agent maintains runbooks and procedures
- `/docs/DECISIONS.md` — orchestrator logs all material decisions

## Quality gates

Before any merge to `main`:

1. CI passes (lint + typecheck + tests)
2. Code review by orchestrator (the founder approves significant changes)
3. QA Agent has integration tests covering the change
4. Documentation updated where applicable

Before deploying to production:

1. Full test suite passes on staging
2. PRD Section 8.10 pre-production checklist completed
3. Founder explicitly approves deployment

## When to call which agent

```
Task involves a UI screen?           → frontend (or admin if internal tool)
Task involves an API endpoint?       → backend
Task involves database schema?       → database
Task involves an external API?       → integrations
Task involves deployment/infra?      → devops
Task involves writing tests?         → qa
Task involves the admin tool?        → admin
```

If a task involves multiple areas (most do), the orchestrator dispatches in parallel where independent, sequentially where dependent (DB changes → API changes → UI changes).

## Velocity expectations

Per PRD Section 9.5: solo founder + 7-agent AI team should hit V1 MVP in approximately 5-7 weeks. This depends on:

- Founder reviewing PRs promptly (within 24 hours)
- Founder providing real-world credentials when needed (Cloudflare, Stripe, Vapi)
- Founder making clear decisions on Tier 3 ambiguities
- Founder testing flows that touch the real world (phone calls, payments, forwarding)

If the orchestrator notices the founder becoming the bottleneck, the orchestrator should slow down dispatching work, not accelerate it.

## Final notes

- The PRD is the source of truth. When in doubt, re-read the relevant section.
- Don't optimize prematurely. Ship working features, then improve.
- Every agent's work goes through the same code review process.
- Customer trust is built through reliability — favor working, tested code over clever architecture.
- The goal is 5 paying customers in 6 weeks, not a perfect codebase.
