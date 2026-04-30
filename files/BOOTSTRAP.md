# Bootstrap Instructions

This file tells you exactly how to start building. Read this first. Takes about 10 minutes.

## What you have

You should have downloaded these 8 files:

1. `README.md` — Overview of how the sub-agent system works
2. `frontend.md` — Frontend Agent definition
3. `backend.md` — Backend Agent definition
4. `database.md` — Database Agent definition
5. `integrations.md` — Voice/Integration Agent definition
6. `devops.md` — DevOps Agent definition
7. `qa.md` — QA Agent definition
8. `admin.md` — Admin Tool Agent definition

Plus separately:
- `voice_agent_platform_prd.docx` — The full PRD (2,400+ paragraphs)

## Step 1: Create your accounts (45 minutes, you do this)

Before opening VS Code, set up these accounts. You'll provide credentials to Claude Code as needed.

### Required for Day 1

- **GitHub** account — to host the repo
- **Cloudflare** account — sign up at cloudflare.com (free tier covers MVP)
- **Vapi** account — sign up at vapi.ai (start with free tier)
- **Stripe** account — sign up at stripe.com (test mode for development)

### Required for Week 2-3

- **ElevenLabs** account — sign up at elevenlabs.io (Creator plan $22/mo for development)
- **Twilio** account — sign up at twilio.com (use the $15 free credit for development)
- **Resend** account — sign up at resend.com (free tier for transactional email)
- **Sentry** account — sign up at sentry.io (free tier for error tracking)

### Optional but recommended

- **Better Stack** account — for status page and uptime monitoring
- **Domain name** — buy from Cloudflare Registrar or Namecheap (about $10-15/year)

## Step 2: Create the repo (5 minutes)

On GitHub, create a new private repo. Don't initialize with README/license/gitignore — Claude Code will set up everything.

Note the repo URL — you'll need it.

## Step 3: Clone locally and open in VS Code (5 minutes)

```bash
git clone <your-repo-url>
cd <your-repo-name>
code .
```

Make sure Claude Code extension is installed in VS Code.

## Step 4: Set up sub-agent files (5 minutes)

In your terminal, inside the repo:

```bash
mkdir -p .claude/agents
mkdir -p docs
```

Move the 7 sub-agent `.md` files into `.claude/agents/`:

```bash
# Adjust the source path to wherever you downloaded the files
mv ~/Downloads/{frontend,backend,database,integrations,devops,qa,admin}.md .claude/agents/
mv ~/Downloads/README.md .claude/agents/
```

Convert the PRD from `.docx` to `.md` and place in `/docs/`:

The simplest way: open the `.docx` in Word or Google Docs, save as Markdown if available, OR copy-paste the content into a new `/docs/PRD.md` file. Doesn't need to be perfect — Claude Code reads markdown well.

```bash
# After saving as markdown:
mv ~/Downloads/voice_agent_platform_prd.md docs/PRD.md
```

Verify your structure:

```
your-repo/
├── .claude/
│   └── agents/
│       ├── README.md
│       ├── frontend.md
│       ├── backend.md
│       ├── database.md
│       ├── integrations.md
│       ├── devops.md
│       ├── qa.md
│       └── admin.md
└── docs/
    └── PRD.md
```

## Step 5: First commit (2 minutes)

```bash
git add .
git commit -m "Initial PRD and sub-agent definitions"
git push
```

## Step 6: Open Claude Code in VS Code

Click the Claude Code icon in VS Code's sidebar. A chat panel opens.

## Step 7: Send the bootstrap prompt

Paste this exact message into Claude Code:

```
You are the orchestrator for building this AI Receptionist platform.

Step 1: Read /docs/PRD.md end-to-end. Pay special attention to:
- Section 0 (How to Use This PRD — your operating instructions)
- Section 7 (Technical Architecture, including wireframes in 7.8)
- Section 9 (Development Team, especially 9.9 Build Order and 9.10 Acceptance Criteria)
- Section 14.7 (Sub-agent definitions — these are also in /.claude/agents/)

Step 2: Read /.claude/agents/README.md for orchestration patterns.

Step 3: Begin Phase 1 of the Build Order (Section 9.9 of PRD):

Day 1 tasks:
- DevOps Agent: Set up monorepo structure (apps/web, apps/api, apps/admin, packages/db, packages/types). Create wrangler.toml for all 4 environments. Set up GitHub Actions CI skeleton. Create empty stub files: /docs/API.md, /docs/SCHEMA.md, /docs/INTEGRATIONS.md, /docs/DEPLOYMENT.md, /docs/PROGRESS.md, /docs/DECISIONS.md
- Database Agent: Create Drizzle schema definitions for all 18 tables from PRD Section 7.2. Generate the first migration. Document everything in /docs/SCHEMA.md.

These can run in parallel. Dispatch both agents now.

Phase 1 exit criterion: Hello-world deploys to staging work. Database has all tables. CI passes on the first PR.

Update /docs/PROGRESS.md as you complete milestones. If you hit any Tier 3 ambiguity (PRD Section 9.11), pause and ask me. Otherwise keep building.

Begin.
```

## Step 8: Provide credentials when asked

Claude Code will pause when it needs credentials. Common moments:

- **Day 1:** Cloudflare account ID and API token (for Wrangler config)
- **Day 4-5:** Stripe API keys (test mode)
- **Day 8-10:** Vapi API key
- **Day 12-14:** Twilio account SID and auth token
- **Day 13:** ElevenLabs API key

Have these ready in a password manager. Provide via `wrangler secret put` commands Claude Code will tell you to run.

**Never paste secrets directly into Claude Code chat.** Always use `wrangler secret put` in your terminal.

## Step 9: Daily rhythm

**Each morning (15-30 minutes):**
- Check Slack/email for overnight CI runs and notifications
- Review any PRs Claude Code created overnight
- Approve or request changes

**Each evening (15-30 minutes):**
- Read /docs/PROGRESS.md to see what got done today
- Address any Tier 3 questions Claude Code raised
- Plan tomorrow's focus area

**Once or twice a week:**
- Test the staging environment end-to-end
- Review costs (Cloudflare, Vapi, etc.) — DevOps Agent generates reports
- Take notes on UX issues for the Frontend Agent to fix

## Step 10: Watch for these milestones

| Day | What should be working |
|---|---|
| 3 | Hello-world deploys to staging |
| 7 | Signup + Stripe checkout works end-to-end |
| 14 | Test calls work — agent answers, transcribed, in dashboard |
| 21 | Onboarding wizard 7 steps work, including forwarding validation |
| 28 | Admin tool works — you can impersonate, edit, see audit logs |
| 35 | Marketing site live with demo agent (Mario's Pizza) |
| 42 | First 5 paying customers live |

If you're behind these milestones by more than 3 days, escalate to Claude Code: "We're behind the Phase X exit criterion. What's blocking? Should we cut scope?"

## What if something goes wrong?

- **Test fails repeatedly:** Tag QA Agent with the specific test name and recent changes
- **External API issue:** Tag Voice/Integration Agent with the service name and error
- **Build fails after merge:** Tag DevOps Agent with the CI log
- **Confused about requirements:** Re-read the relevant PRD section, then ask Claude Code with specific section number
- **Decision paralysis on a Tier 3 question:** Make the call yourself, document in /docs/DECISIONS.md, move on

## Realistic expectations

This is a 5-7 week build with you (the founder) actively engaged 1-3 hours per day. AI agents are powerful but not autonomous — you remain the architect, product owner, and final approver.

If you can't commit to that level of engagement, the build will take longer (8-12 weeks) but is still doable. If you can only spare 30 minutes per day, expect 12-16 weeks.

If something feels off — agent output is poor quality, decisions feel wrong, or the build is drifting from the PRD — slow down. Don't dispatch more work until things are back on track.

## Final reminder

The PRD is the source of truth. Sub-agent files are operating instructions. This bootstrap doc is just to get you started.

Once you're moving, the orchestrator (Claude Code) handles most of the day-to-day. Your job: review, decide, ship.

Good luck. You're building something real.
