Product Requirements Document
AI Receptionist Platform
Never miss a call — for restaurants, salons, clinics and small businesses
Version 1.0 — MVP
April 2026

0. How to Use This PRD
This document is designed to be self-executing. If you are Claude Code (or any AI coding assistant) reading this, treat the entire document as your task brief and follow the protocol below. Do not wait for the founder to dispatch each task — orchestrate the build yourself, ask only when truly ambiguous, ship working code in vertical slices.
Critical: How this is meant to work
The founder pastes this PRD into Claude Code in VS Code (or commits it to /docs/PRD.md and points the agent at it). From that single action, you should be able to build the entire MVP with minimal human interaction. The founder reviews PRs, answers blocking questions, and approves merges — but does not write code or hand-hold every step.
0.1 First Actions (Day 1)
On first read of this PRD, execute the following in order:
Read the entire document end-to-end before writing any code
Set up the repository structure as defined in Section 9.6
Create the seven sub-agent definition files in /.claude/agents/ — copy the prompts verbatim from Section 14.7
Commit this PRD to /docs/PRD.md so all sub-agents can reference it
Create /docs/API.md as an empty stub — the Backend Agent will populate it
Create /docs/SCHEMA.md as an empty stub — the Database Agent will populate it
Create /CONTRIBUTING.md with the conventions extracted from Section 9 and the agent prompts
Initialize Git, push to a private GitHub repo (founder will create the repo and provide URL)
Begin Phase 1 of the Build Order in Section 9.9
0.2 Orchestration Protocol
You are the orchestrator. Your job is to dispatch work to the right specialized sub-agents from Section 14.7, integrate their output, and ship working features.
For any task, identify which sub-agent owns the work (frontend, backend, database, integrations, devops, qa, admin)
Dispatch parallel tasks when work is independent (e.g., DB schema + API stubs + UI mockup can all run at once)
Respect handoff order: Database changes → Backend API changes → Frontend consumption
After each merge, run the QA Agent to validate the integration
Commit early and often — small, reviewable PRs not giant feature dumps
Update /docs/PROGRESS.md after every completed feature so founder can see the build advancing
0.3 When to Ask the Founder
Default: keep building. Only stop and ask when truly necessary.
Ask the founder when:
A decision affects pricing, business model, or customer-facing copy
Two requirements in the PRD genuinely conflict and you cannot resolve from context
You need a real-world credential (Vapi key, Stripe key, Cloudflare account access)
A feature requires a third-party integration not specified in the PRD
You are about to make a change that affects deployed production systems
You believe a major architectural decision in the PRD is wrong and want to challenge it
Do not ask when:
A naming choice is ambiguous (pick a sensible name, document it, move on)
A small UI detail is not specified (use the design system, common sense, and ship)
A test approach is not specified (the QA Agent decides)
You hit a transient bug (debug it, fix it, write a regression test)
Refactor opportunity arises (do it as part of the current task, do not pause for permission)
0.4 Self-Documentation Requirements
As you build, keep these documents up to date so you (or future agents) can pick up the thread:
/docs/PROGRESS.md — high-level checklist of what is done vs in progress vs not started
/docs/API.md — every endpoint with request/response schema (Backend Agent owns)
/docs/SCHEMA.md — every table with column descriptions and indexes (Database Agent owns)
/docs/INTEGRATIONS.md — every external API used, with rate limits and costs (Voice/Integration Agent owns)
/docs/DEPLOYMENT.md — environment setup, deploy procedures (DevOps Agent owns)
/docs/DECISIONS.md — log of material decisions made and rationale, in chronological order
0.5 What 'Done' Looks Like
V1 MVP is complete when all acceptance criteria in Section 9.10 are met AND the founder can demonstrate the full happy-path flow live. See Section 9.10 for the precise checklist.

1. Executive Summary
This document defines the requirements for an AI receptionist platform that helps small businesses capture every incoming call. The platform answers calls 24/7 in a natural voice, handles reservations and common questions, takes orders, and routes complex requests to the business owner — replacing missed calls and part-time receptionists at a fraction of the cost.
The platform wraps four underlying APIs — Vapi (orchestration), ElevenLabs (voice cloning), Groq (LLM), and Twilio (telephony) — into a single product that non-technical clients can configure in under 30 minutes.
Product focus
The MVP is inbound only — answering calls to small businesses. Outbound calling (cold outreach, follow-ups) is a planned Phase 2 expansion that builds on the same infrastructure but is intentionally out of scope for V1 to keep focus, reduce compliance complexity, and let us learn from real customers first.
1.1 Vision
Make professional-quality phone reception accessible to every small business — from neighborhood restaurants to single-location salons — without the cost of hiring a receptionist or the friction of installing complex IVR systems.
1.2 Target Users
Restaurants and food service (primary launch vertical)
Salons, spas, and beauty businesses
Dental offices and small medical clinics
Auto repair shops, plumbers, contractors
Real estate agencies and property managers
1.3 Success Metrics
Metric
MVP Target (90 days)
Year 1 Target
Paying customers
15
200
Monthly Recurring Revenue
$2,500
$40,000
Calls handled per month
5,000
200,000
Gross margin
75%
85%
Customer churn (monthly)
Below 8%
Below 5%
Time to first call (new client)
Under 30 min
Under 15 min
Calls successfully resolved by AI
70%
85%

2. Problem and Opportunity
2.1 Problem
Small businesses miss 30 to 50 percent of their inbound phone calls. A study of 5,000 SMB phone lines in 2025 found:
38% of calls go unanswered during business hours (busy line, staff occupied)
82% of calls outside business hours go to voicemail, only 12% leave a message
Restaurants lose an average $750/month in missed reservations
Salons lose an average $1,200/month in unbooked appointments
The current options are bad:
Hiring a part-time receptionist costs $1,500–$2,500/month — too expensive for most SMBs
Answering services charge $300–$500/month and read from generic scripts
Voicemail loses customers — most won't leave a message
IVR systems ('press 1 for hours') frustrate callers and miss the same calls
2.2 Why now
Voice AI quality reached human-indistinguishable in 2026 (sub-100ms latency, natural prosody)
Voice cloning works from a 15-second sample at near-perfect fidelity
Orchestration platforms (Vapi, Retell) reduced build time from months to weeks
SMBs are AI-aware after 2 years of ChatGPT mainstream adoption
Existing competitors (Slang.ai, Numa) have validated willingness-to-pay at $200–$400/mo
2.3 Market size
Total addressable market for AI receptionists in SMB: approximately $3.6 billion globally in 2026, projected to reach $9 billion by 2028.
US restaurants: 660,000 establishments × $99/mo blended = $785M
US salons and spas: 320,000 establishments × $99/mo = $380M
US dental and small medical clinics: 200,000 × $149/mo = $358M
US trades and home services: 1.2M businesses × $79/mo = $1.14B
Multi-location chains: $850M (chains pay per location)
2.4 Competitive landscape
Competitor
Pricing
Focus
Our advantage
Slang.ai
$399/mo
Restaurants only
More verticals, lower entry price
Numa
$300+/mo
Restaurants, auto repair
Better voice cloning, simpler setup
Goodcall
$59–$199/mo
General SMB
Stronger conversation handling
PolyAI
Enterprise
Hotels, large chains
Self-serve, no sales process
Hiring a receptionist
$1,500–2,500/mo
Manual
10x cheaper, 24/7

3. Product Overview
3.1 What the product does
When a customer calls a business, the AI receptionist:
Answers within one ring with a personalized greeting
Handles common requests: hours, location, menu, booking, takeout
Captures intent and routes to the business owner via SMS, email, or Slack
Logs every call with full transcript and recording
Falls back to voicemail or human if it can't help
3.2 Core capabilities (V1)
Voice agent builder with 5 vertical-specific templates at launch (restaurants, salons/spas, dental/clinics, auto repair, real estate) plus a generic template for everything else
Owner-edited system prompts — full control over what the agent says
Voice picker — 12 stock American English voices
Voice cloning available on Pro and Multi-location plans (admin-provisioned for safety)
Knowledge base — owners upload menus, FAQs, allergen lists for the agent to reference (RAG)
Phone number provisioning with carrier-by-carrier forwarding wizard
Real-time call logs with transcripts and recordings
Test calls during onboarding to validate agent before going live
Multi-user accounts with role-based permissions (owner, manager, staff, viewer)
Webhooks for SMS / email / Slack notifications
Reservation system integrations (OpenTable, Resy)
AI quality monitoring with auto-grading of random call samples
Built-in safety guardrails (no legal/medical/financial advice)
Audit logs for all config changes and recording access
Stripe-based subscription billing with multi-location support
3.3 What's NOT in V1
Explicitly out of scope for the MVP — these are planned Phase 2 or later additions:
Outbound calling (cold reach, follow-ups, no-show recovery) — Phase 2
Other verticals beyond the 5 launch templates (e.g., legal, contractors, hospitality) — V1.1+
POS system integrations (Square, Toast) — Phase 2
Native CRM integrations (HubSpot, Salesforce) — Phase 2
Number portability (bring your own number) — Phase 2
Geographic expansion beyond US — Canada in V1.1, UK and AU in V2
Multi-language support beyond English — Spanish in V1.1, Arabic/Chinese/Hindi in V2
White-label / agency tier — Phase 3 (Year 2)
Mobile app (iOS, Android) — Phase 3
On outbound calling
Outbound is intentionally deferred to Phase 2. Inbound is faster to validate (clear ROI, no compliance overhead, lower legal risk), and the same Vapi + ElevenLabs + Groq + Twilio stack will support outbound when we are ready. We will add outbound only after we have 25 or more paying inbound customers and can fund the additional compliance work (TCPA, DNC scrubbing, caller ID verification).

4. User Flows
4.0 Public Homepage Demo (Try Before You Buy)
This is the most important conversion mechanism on the site. Because there is no free trial and no refund, visitors need a way to experience the product before paying. The homepage hosts a live demo agent — a fully functional voice receptionist for a fictional restaurant — that anyone can call from their phone with a single click.
Why this is critical
Without a trial or refund, visitors have no risk-free way to evaluate the product. The demo solves this by letting them experience the actual voice agent quality before paying anything. This replaces the trust-building work a free trial would normally do.
How it works
Visitor lands on yourdomain.com
Hero section shows a phone number to call: 'Call (555) 555-DEMO and talk to our AI receptionist for Mario\'s Pizza'
Below the number: a 'Call from your browser' button (uses WebRTC via Vapi's web SDK — no phone needed)
Optional input field: 'Or try it as your own business — enter your business name'
If business name entered: agent personalizes greeting ('Thanks for calling [your business]') but uses Mario's underlying menu/data — cosmetic personalization only in V1
Visitor calls the number or clicks the browser button
Live voice agent answers as Maya, the AI receptionist
Visitor can ask anything: hours, menu, take a reservation, ask about parking, request takeout
Agent has a real knowledge base loaded (sample menu, sample hours, sample FAQ)
Conversation feels exactly like calling a real restaurant
Visitor hangs up impressed, scrolls down to see pricing and features
CTA throughout the page: 'Set up yours in 30 minutes'
Demo agent specs
Default fictional restaurant: 'Mario's Pizza' — generic Italian restaurant in Brooklyn, NY
Custom-by-name option: visitor types their business name, demo greets them with that name
Pre-loaded knowledge base: full menu PDF, hours, allergen list, parking info, FAQ
Real Vapi assistant with full functionality (reservations, orders, info)
Phone number: dedicated Twilio number for demo only (e.g., +1-555-DEMO)
Browser call: Vapi Web SDK embedded in the marketing site
Stock voice (cloned demo voice would be misleading)
Reservations / orders go to a sample-only inbox (not a real restaurant)
Cost and rate limiting
This is genuinely useful but can also be expensive if abused. Mitigations:
Each call capped at 3 minutes — agent ends the call gracefully after 2:30 with: 'Thanks for trying our demo! Let me know if you have more questions on our website.'
Phone number rate-limit: same caller ID can only call 3 times per day
Browser call: same IP rate-limited to 5 calls per hour
Cloudflare WAF + Turnstile (CAPTCHA) on the browser call button to block bot abuse
Estimated cost: 100 demo calls/day × $0.12/call ≈ $360/month — counted as marketing spend
Conversion tracking and post-demo CTA
Track: visitors who tried the demo vs. visitors who skipped it
Track: demo-callers who signed up within 7 days (key conversion metric)
Auto-capture demo conversation transcripts for marketing material with consent
After demo ends, in-browser CTA: 'Want this for your business? Get started →'
For paid traffic only (UTM-tagged ad clicks): show promo code 'DEMO50 — 50% off your first month, 24 hours only'
For organic traffic (SEO, direct): no urgency code — let the demo speak for itself
Phase 2 enhancements
Multiple demo agents per vertical (Mario's Pizza, Sandra's Salon, Dr. Lee's Dental, etc.) — pick which one to call
Full custom demo: visitor uploads their actual menu PDF and gets an agent trained on their real data on the fly
Recorded demo highlights playable on the homepage for those not ready to call
4.1 Sign Up + Plan Selection
First experience for any new client. Goal: get them to their first working call in under 30 minutes. There is no free trial and no refund window — but every visitor can experience the product before signing up by testing the live demo agent on our homepage.
User lands on marketing site, talks to the live demo agent (Section 4.0)
If satisfied, clicks Get Started
Email + password signup (or Google/Microsoft OAuth)
Quick vertical question: 'What kind of business are you?' — six radio options: (1) Restaurant / cafe / food service, (2) Salon / spa / barber, (3) Dental / medical clinic, (4) Auto repair / mechanic, (5) Real estate agency, (6) Other
If 'Other' selected: follow-up question 'Roughly which is closest?' with same 5 options — used as base template
Plan selection page (Stripe checkout — card charged immediately, all sales final)
Land on onboarding wizard
4.2 Onboarding Wizard
Seven steps, designed to take 15 to 30 minutes total. Progress saved between sessions.
Top of every wizard page: a 2-3 minute screen-recording walkthrough video (Loom-style) showing the complete flow with voiceover. Auto-pauses if user interacts with the form. Re-recorded every major UI update.
First 5 customers: concierge onboarding via Zoom — founder personally walks through the wizard with them. Hybrid model — they see and click while founder explains. ~45 minutes per customer. After customer #5, switch to fully self-serve with the video.
Onboarding abandonment recovery: if customer pays but doesn't complete the wizard within 24 hours, automated email reminder. After 72 hours, a second email. After 7 days, founder personally emails them. Their data and progress are saved.
Step 1: Business details
Business name, address, existing phone number, website
Hours of operation (per day, with closed days)
Brief description (auto-fed into system prompt)
Optional: menu URL or service list URL
Step 2: Phone setup
Option A: Forward existing number to a Vapi-managed number
Option B: Get a brand new number (no forwarding needed)
System auto-provisions a Twilio number in the same area code
Step 3: Pick a voice
Choose from 12 stock American English voices, with previews
Voice cloning is available on Pro and Multi-location plans by request — contact support after signup
Cloned voices are reviewed and provisioned by our team within 24 hours to prevent abuse
Step 4: Upload knowledge base (optional but recommended)
Upload menu PDFs, FAQ documents, allergen lists, parking info, or any other reference materials
Limit: 5MB per file, 25MB total per business
Documents are auto-indexed for the agent to reference during calls
Owner can preview what the agent 'sees' from each document
Skip and add later if not ready
Step 5: Customize the agent
Pre-filled system prompt based on vertical (restaurant template, salon template, etc.)
Owner can edit the prompt directly — full control over tone and rules
Customize first message: 'Thanks for calling [name], how can I help you today?'
Toggle on/off: takes reservations, takes orders, answers menu questions, routes complex requests, takes messages
Built-in safety rules cannot be removed — agent always refuses legal/medical/financial advice
Step 6: Test call
Client enters their cell number
Platform verifies the number (one-time SMS code)
Client clicks 'Call me now' — receives a call from the AI
Test conversation, then approve or tweak
Test calls do count against plan minutes — they are real Vapi calls, just to a verified number
Step 7: Activate forwarding
Carrier-specific instructions shown based on detected carrier
AT&T: dial *72 + new number
Verizon: dial *72 + new number, hear two beeps, dial again to confirm
T-Mobile: settings menu in carrier app
VoIP: dashboard configuration in their phone system
Client confirms forwarding is set up — agent is now live
4.3 Daily Operation
Customer dials the business's existing number
Call is forwarded to Vapi-managed number
AI agent answers within one ring with the configured greeting
Conversation handled (reservation, hours, takeout order, etc.)
Outcome captured (e.g., reservation made, info given, transferred to human)
Webhook fires to client's SMS / email / Slack with summary
Call appears in dashboard with full transcript and recording
Owner reviews calls at end of day, can listen to any recording
4.4 Owner's Dashboard Experience
The dashboard is where business owners spend 5 minutes a day. Optimized for at-a-glance review on mobile.
Today's calls summary (count, top intents, any flagged calls)
Call log with filters: date, outcome, duration
Click any call to see transcript, listen to recording, or share
Reservations / orders captured today with one-tap confirm
Flagged calls (couldn't be handled) appear at top with red badge
Weekly insights: 'You handled 47 calls this week, captured 12 reservations'
4.5 Edge Cases and Error Flows
Caller asks to speak to a human: agent says 'I will let [owner name] know to call you back, what is the best number?' — collects number, fires high-priority webhook
Caller asks something the agent can't answer: agent offers to take a message; transcript flagged for owner review
Call quality drops mid-call: system attempts reconnection, falls back to voicemail if it cannot recover
Multiple callers at once: all handled in parallel up to plan concurrency limit; beyond limit, callers hear 'we are busy, please hold'
Client exceeds plan minutes: system continues at overage rate; alerts client at 80% and 100% of plan
Voice cloning fails consent verification: client must re-record consent phrase before any cloned voice can be activated
Agent says something wrong: owner can flag in dashboard; flagged calls reviewed and used to refine system prompts
4.6 First-Call Concierge (First 30 Days per New Customer)
Customer goes live, and the very first calls are the highest-risk moment for the relationship. We don't want their actual customers experiencing a broken agent on call #1.
First 3 calls per new customer auto-flagged for review within 1 hour
All calls in the first 30 days reviewed via auto-grading at 100% sample rate (vs normal 5% sampling)
If any flagged call shows a real issue, founder reaches out proactively to the customer with the fix
After 30 days, customer drops to standard random sampling
Customer sees a 'New customer review' badge in dashboard during this window — sets expectation that we are watching
4.7 Forwarding Setup Validation
Forwarding is the most error-prone step in onboarding. About 30% of customers will think they set it up but get it wrong. We need automatic detection.
After customer confirms forwarding in Step 7, system automatically calls the customer's existing business number
If the call routes to our agent: forwarding is verified, dashboard shows green check
If the call doesn't route to us: dashboard shows 'Forwarding not detected — let us help' with a re-walkthrough
System retries verification every 6 hours for 48 hours
If still not detected after 48 hours: founder is alerted and reaches out personally

5. Functional Requirements
5.1 Authentication and Account Management
Customer authentication is handled by Better Auth, a self-hosted auth library running inside our Cloudflare Workers. No per-user fees, full control over the experience, and our user records live in the same D1 database as everything else.
Email + password signup with email verification
OAuth via Google and Microsoft
Magic link login as fallback
Password reset flow with secure tokens (15-minute expiry)
Two-factor authentication (TOTP) — optional in V1, required for admin accounts
Session management with refresh tokens
Account profile (business name, contact email, billing address, tax ID)
Internal staff (Anthropic team / your support team) auth is handled separately by Cloudflare Access, not Better Auth. This protects admin tools at admin.yourdomain.com behind SSO.
5.2 Multi-User Accounts and Roles
Restaurants and small businesses often have an owner plus a manager and a few staff who need access. Permissions matter — staff shouldn't be able to change billing or rebuild the agent.
Role
Permissions
Owner
Full access — billing, agent config, integrations, team management, delete account
Manager
Agent config, view all calls, integrations, no billing access
Staff
View calls, listen to recordings, mark calls as resolved, no config or billing access
Read-only viewer
View calls and analytics only — useful for accountants or area managers
Plan
Seats included
Starter ($79/mo)
Owner + 1 additional seat
Growth ($149/mo)
Owner + 3 additional seats
Pro ($299/mo)
Owner + 6 additional seats
Multi-location ($99/mo per location)
Owner + 3 seats per location + unlimited central admin viewers
Additional seats beyond plan limit: $9/seat/mo on any plan.
5.2.1 Multi-Location Permissions
Multi-location accounts have a 2-level permission model: organization-level (across all locations) and location-level (specific to one location).
Organization Owner: full access across all locations, billing, can add/remove locations
Organization Manager: view-only across all locations + dashboard rollup, no billing
Location Manager: full agent config and call review for assigned location(s) only
Location Staff: view calls and recordings for assigned location(s) only
Cross-location actions (e.g., updating a template across all 10 stores) require Org Owner role
A user can have different roles in different locations (Manager at Store 1, Staff at Store 2)
Org Owner sees a unified dashboard with per-location stats; Location Manager sees only their own
5.3 Voice Agent Builder
The agent builder is where owners turn a blank slate into a working AI receptionist. Designed for non-technical users.
Visual editor for system prompt with vertical-specific templates (restaurant, salon, clinic, etc.)
Owners can customize the system prompt directly — full control over what the agent says
First message editor with variable insertion (e.g., {{business_name}})
Voice picker — 12 stock American English voices, with previews
Toggle capabilities: take reservations, take orders, answer menu, transfer to human, take messages
Test call feature (places call to client's verified number)
Agent versioning — save drafts, publish live version, roll back to previous version
Live preview: see exactly what the agent will say to common scenarios before publishing
5.4 Voice Cloning (Admin-Controlled)
Voice cloning is intentionally NOT exposed to owners in the customer-facing dashboard. Instead, it is an admin-only operation handled by our team for clients on Pro and Multi-location plans who specifically request a cloned voice.
Why admin-only:
Reduces voice cloning abuse risk (deepfakes, celebrity impersonation, fraud)
Ensures consent verification is properly captured and audited
Keeps ElevenLabs costs predictable (cloned voices use higher-tier API calls)
Lets us reject inappropriate requests (someone trying to clone a public figure)
How it works:
Customer requests voice cloning via support email
Customer uploads 1–3 minute audio sample to a secure portal
Customer records consent phrase: 'I, [name], consent to my voice being used for [business name] on this platform'
Admin reviews sample + consent, verifies it matches
Admin uploads to ElevenLabs and assigns Voice ID to customer's agent
Customer sees their cloned voice as an option in the voice picker
Audit log: every clone request, approval, rejection, and assignment is logged with timestamp and admin user.
5.5 Knowledge Base (Owner Uploaded)
System prompts can only carry so much context. For menus, FAQs, allergen lists, parking instructions, and other business-specific information, owners upload knowledge base documents that the AI agent references in real time during calls (RAG — retrieval-augmented generation).
Upload PDFs, Word docs, or plain text files (5MB per file, 25MB total per business)
Automatic chunking and embedding (using Cloudflare Workers AI for embeddings)
Vectors stored in Cloudflare Vectorize (free tier covers MVP, then $0.01 per 100K queries)
Examples: menu PDF, allergen guide, parking info, FAQ document, holiday hours, dress code
Owner can preview what the agent 'sees' from each document
Re-upload triggers re-indexing automatically
During calls, the agent retrieves the 3 most relevant chunks and includes them in the LLM context
This is a key differentiator. Without a knowledge base, the agent can only answer what's in its prompt. With one, it can describe the menu in detail, explain allergens accurately, and handle nuanced questions.
5.6 Phone Number Management
Provision new Twilio numbers via Vapi (US for V1, Canada in V1.1)
Forwarding setup wizard with instructions per major US carrier (AT&T, Verizon, T-Mobile, Comcast, Spectrum, Vonage, RingCentral)
Auto-detect carrier when customer enters their existing number
Number portability — allow clients to bring their own number (Phase 2)
On churn: number held 30 days for reactivation, then released back to Twilio pool
Phone number cost ($1.15/mo) is bundled into all plan prices, not charged extra
5.7 Call Handling and Quality
Real-time inbound call routing through Vapi
Webhook handler for call events (started, in-progress, ended, error)
Recording storage — 30 days standard, 1 year on Pro+ plans
Transcript generation via Deepgram Nova-3
Auto-detect call outcome via LLM (reservation, info given, complaint, transferred, voicemail)
Latency target: under 800ms time-to-first-response (industry threshold for natural conversation)
Call success metric: agent successfully handled the request without falling back to voicemail or human
5.8 AI Quality and Safety Guardrails
Voice agents will sometimes say wrong things. We need active mechanisms to detect and prevent this — not just hope it doesn't happen.
Built-in refusals (hardcoded into every system prompt):
Never give legal advice — always defer to professionals
Never give medical advice or diagnoses — always defer to a doctor
Never give financial or tax advice
Never invent prices, hours, or availability not in the knowledge base or system prompt
Never make promises on behalf of the business owner ('we'll definitely waive that fee')
If unsure about anything specific, take a message and have a human follow up
Quality monitoring:
Random sample 5% of calls daily for automated grading (using a separate LLM as judge)
Grading dimensions: accuracy, hallucination, off-script behavior, tone, completion
Owners can flag specific calls in the dashboard
Flagged calls trigger weekly system prompt review and refinement
Public quality score per agent in the customer's dashboard
5.9 Dashboard and Analytics
Mobile-first responsive design (most owners check on phones)
Today's view as default home screen
Call log with filters (date, outcome, duration, flagged)
Embedded audio player for recordings with playback speed control
Searchable transcripts (full-text search)
Outcome distribution chart (pie or bar)
Usage tracking (minutes used vs. plan)
Weekly digest email summary every Monday morning
Quality score and flagged-calls counter at top of dashboard
5.10 Notifications and Webhooks
SMS notifications for high-priority events (callback requests, urgent complaints)
Email notifications (configurable per event type)
Slack notifications via OAuth integration
Generic webhook out (JSON POST) for advanced users
Webhook reliability:
3 retries with exponential backoff (immediate, 1 minute, 5 minutes)
After 3 failures: dead-letter queue with email alert to customer
Webhook delivery dashboard shows last 100 events with status
Customers can manually retry from dashboard
Real-time events delivered within 30 seconds of call end (P95)
5.11 Integrations (V1)
OpenTable — push reservation when AI books a table
Resy — same as OpenTable
Google Calendar — push appointments for salons / clinics
Slack — notifications channel
Generic webhook (for everyone else)
5.12 Billing
Stripe Subscriptions for monthly plans
Stripe Metered Billing for overage minutes
Invoice generation and email delivery
Usage alerts at 50%, 80%, 100% of plan
Plan upgrade/downgrade with proration
Annual billing with 17% discount
All sales final — no free trial, no refunds (except for service outages or genuine technical failures, at our discretion)
Multi-location billing: one Stripe subscription with quantity = number of locations (cleaner for chains)
Internal test accounts: marked as such, billed at zero, never count toward MRR or analytics
5.12.0 Overage Policy (Soft Cap)
Soft cap with auto-overage protects the customer experience. Hard caps (cutting off real callers) damage trust.
At 100% of plan minutes: dashboard banner + email — 'You are over your plan'
At 110%: SMS notification to owner
Beyond plan: $0.50/min overage, billed at end of cycle as separate line item
No hard cap — calls never get cut off
After 2 consecutive months of overage: prompted to upgrade plan with calculation showing they will save money
5.12.1 Failed Payment Handling
Clear, customer-friendly recovery flow that gives time to fix card issues without service interruption on day one.
Day
Action
Day 1 (failure)
Stripe attempts retry. Email notification with link to update card. Service continues.
Day 3
Second retry attempt. Second email. Dashboard banner appears.
Day 7
Third retry attempt. SMS to owner. Service still active.
Day 8
Service suspended — agent stops answering calls. Calls go to voicemail with apologetic message.
Day 15
Final email warning. Data preserved.
Day 30
Account marked inactive, data retained 90 days.
Day 120
Account permanently deleted, all data purged.
5.13 Customer Support
Email support at help@yourdomain.com (Crisp or Intercom)
Initial response within 24 hours during V1, 4 hours by Year 1
Founder personally handles support for first 50 customers (not delegated)
Self-service knowledge base with searchable articles
Onboarding video guides embedded in the wizard
Status page (status.yourdomain.com) shows real-time system health
In-app feedback button on every page
5.14 Audit Logs
Required for HIPAA add-on customers, useful for everyone, especially multi-user accounts.
Every config change logged: who changed what, when, from what to what
Every recording access logged: who listened, when, from what IP
Every voice cloning approval logged with admin name and consent file reference
Owner can export audit log as CSV
HIPAA add-on retains audit logs for 7 years
5.15 Data Export and Privacy (CCPA / GDPR Readiness)
Owner can export all account data as ZIP (CSV + audio files) at any time
Caller can request transcript of their own call (CCPA right of access) — handled via support email in V1, automated portal in V2
Account deletion deletes all data within 30 days, except where required by law
Voice cloning consent records retained 7 years (regardless of account status) for liability protection
5.16 Admin Override (Internal Tool)
Our team needs full access to any customer account to provide support, troubleshoot issues, and recover from misconfigurations. This is critical because we run support personally for the first 50+ customers and need to fix problems quickly.
Capabilities granted to admins (our team only):
Log in as any customer (impersonation) to see exactly what they see
Edit any customer's agent prompt, voice, knowledge base, integrations
Trigger test calls on a customer's behalf
Issue refunds, credits, or plan changes via Stripe
Suspend or restore service
View all calls, transcripts, recordings across all accounts
Resolve flagged calls and update prompt templates from real examples
Critical safeguards:
Admin access is gated behind Cloudflare Access SSO with mandatory MFA
Every admin action is logged in the audit log with admin user ID, timestamp, IP, and what was changed
Customer is notified by email any time an admin impersonates their account or modifies their config
Admin sessions auto-expire after 1 hour of inactivity
Admins cannot read voice cloning consent recordings without a recorded business reason
Quarterly review of admin access — revoke access for anyone who left the team
Admin tool URL: admin.yourdomain.com (separate Cloudflare Pages app, separate routing)
5.17 Internal Admin Tool — Feature List
The full feature set of the internal admin tool. Built as a separate Next.js app on admin.yourdomain.com with Cloudflare Access SSO. Approximately 2 weeks of build effort for V1.
Feature
What it does
Customer dashboard
List of all customers, recent signups, churned customers, flagged accounts, MRR rollup
Customer impersonation
One-click 'log in as' any customer to see exactly what they see
Edit any account
Modify agent prompt, voice, knowledge base, integrations, plan, business details
Billing tools
Issue refunds, change plans, apply credits, view full Stripe history per customer
Voice cloning queue
Review/approve/reject clone requests, listen to consent recordings, upload to ElevenLabs
Quality flagged calls
Review queue with audio + transcript + system prompt context
Audit log search
Searchable across all customer accounts and admin actions
Promo code management
Create, deactivate, monitor redemptions, view usage analytics
System health
Active agents, calls in progress, error rates, API status across vendors
Customer notes
Sticky notes per account for support context
Feature flags
Enable/disable features per customer for testing or recovery
Test mode
Place test calls from admin perspective without affecting customer billing
Bulk actions
Apply prompt template updates across multiple customers in same vertical
5.18 Promo Codes
Used for beta testers (family/friends), launch marketing, and conversion from the homepage demo. Managed through the admin tool.
Beta codes: 100% off for 3 months (issued to family/friends during pre-launch)
Launch codes: 50% off first month, e.g., 'FRIENDS50', 'LAUNCH50' (used in marketing)
Demo conversion code: 'DEMO50' shown to paid traffic visitors after they finish the homepage demo, expires in 24 hours
Limits: max 50 redemptions per code, 90-day expiry, single-use per customer email
Stackable: no — only one promo code per signup
Affiliate codes for referral program: deferred to V2
Internal test accounts: marked as such, billed at zero, never count toward MRR or analytics
5.19 AI Quality Enforcement and Safety Approval
Mandatory AI safety guardrails are non-negotiable and cannot be removed by customers.
Built-in refusals (no legal advice, medical advice, financial advice, inventing facts) are auto-injected into every system prompt
If a customer edits their prompt in a way that the system flags as weakening safety, the change is queued for admin review before going live
Admin reviews and either approves the change or rejects it with a note to the customer
Auto-detection uses an LLM-as-judge to compare proposed prompt vs. previous prompt for safety degradation
Targets: less than 2% of calls flagged as bad by month 3, 0% safety guardrail violations ever
5.20 Weekly Digest Email Specification
Sent every Monday at 7am in the customer's local time zone. Designed for owners to read on their phone in 60 seconds.
Section
Content
Subject line
{{business_name}}: 47 calls this week, 12 reservations captured
Top stat
Calls handled vs. last week with delta percentage
Top 3 outcomes
Reservations, info-given, transfers — with counts
Quality score
Out of 100, with 1-week trend (up or down arrow)
Highlighted calls
1-2 worth listening to — interesting, complex, or flagged
Plan usage
Minutes used vs. plan total, e.g., '150 of 200 (75%)'
Suggested action
One specific recommendation, e.g., 'Your prompt could be improved on takeout questions — review here'
CTA buttons
View full call log, listen to flagged calls, edit agent
Vertical-specific success metrics in the digest: restaurants see orders captured + reservations booked; salons see appointments scheduled; clinics see callbacks routed; auto repair sees service appointments scheduled; real estate sees lead handoffs to agents.
5.21 Caller-Side Confirmations
Confirmations are sent only to the business owner, never to the calling customer. Rationale: simpler privacy posture, fewer points of failure, less spam risk for callers.
Owner receives SMS or email summary after every call: caller phone number, intent, key details, link to full transcript
For restaurants: owner receives the order details formatted as a receipt — copy-pasteable into POS systems
For salons/clinics: owner receives appointment request with service requested, preferred time, and customer info
POS receipt integration is V1.1: push order directly to Square/Toast as a draft order
V1: SMS/email summary in receipt format only — owners manually enter into their POS
5.22 Account Deletion Flow
Account deletion has cascading effects across multiple systems. Designed flow ensures clean teardown.
Customer requests deletion via dashboard or support email
System shows confirmation: 'This will permanently delete your account, all calls, recordings, and configurations'
Customer types business name to confirm (anti-mistake guard)
Account marked as 'pending deletion' — service stops immediately
30-day grace period — customer can reactivate
After 30 days: Twilio number released, Vapi assistant deleted, ElevenLabs voice ID removed, R2 recordings purged, D1 records soft-deleted
Voice cloning consent recordings retained 7 years per legal requirement (only piece of data preserved)
Confirmation email to customer when deletion completes
HIPAA add-on customers: deletion timeline configurable up to 7 years for compliance with healthcare records retention laws.

6. Non-Functional Requirements
6.1 Performance
Voice agent latency: under 800ms time-to-first-response
Dashboard page load: under 2 seconds at 95th percentile
Webhook delivery: under 1 second after call ends
Concurrent calls per account: 5 (Starter), 15 (Growth), 50 (Pro)
6.2 Reliability
Platform uptime: 99.5% (MVP), 99.9% (post-Series A)
Call success rate: 98%+
Automatic failover for STT/TTS providers
Daily backups of all client data
Component-level status page (status.yourdomain.com) — separate health indicators for: API, calls, dashboard, integrations, and admin tools. Auto-updated from health checks.
6.3 Security
All data encrypted at rest (AES-256) and in transit (TLS 1.3)
API keys stored in encrypted vault (AWS KMS or equivalent)
Vapi webhook signature verification on every event
Rate limiting on all public endpoints
SOC 2 Type 1 compliance within 12 months
HIPAA / BAA available as add-on for medical clients
6.4 Compliance and Legal
AI disclosure: agent must say 'I am the AI assistant for [business]' if asked
Recording disclosure where required by state law (CA, FL, IL, MD, MA, MT, NV, NH, PA, WA)
GDPR-compliant data handling for EU clients (Phase 2)
Voice cloning consent records retained 7 years
Note: V1 is inbound only, so no TCPA / DNC compliance work needed yet
6.5 Scalability
Support 500 concurrent calls across all clients (MVP)
Support 25,000 calls per day at MVP launch
Architecture supports horizontal scaling for 10x growth without re-architecture
6.6 Rate Limiting
Defensive limits to prevent abuse and self-inflicted DoS. High enough that legitimate use never hits them, low enough that misconfiguration self-protects.
Knowledge base queries during a single call: 10 max (prevents agent looping)
Webhook delivery: 100 outbound per minute per customer
Customer API calls (when public API ships in V2): 1,000/hour per account
Admin operations: 10/min per admin user (prevents accidental mass changes)
Demo agent calls: 3/day per phone number, 5/hour per browser IP
Signup attempts: 3/hour per IP (prevents spam)
Password reset requests: 3/hour per email (prevents abuse)

7. Technical Architecture
7.1 The Stack
Layer
Tool
Why
Frontend
Next.js 15 + React + Tailwind
Fast SSR, SEO-friendly marketing pages
Backend API
Hono on Cloudflare Workers
Type-safe, runs at the edge globally, near-zero cold starts
Database
Cloudflare D1 (or Neon Postgres)
D1 for simple use, Neon if we need full Postgres features
Authentication
Better Auth (on Workers)
Self-hosted, no per-user fees, full control over signup and session logic
Voice orchestration
Vapi
Fastest path to working voice agent
Voice cloning + TTS
ElevenLabs
Best quality cloning at this price point
LLM
Groq (Llama 3.3 70B)
Fastest inference, generous free tier
STT
Deepgram Nova-3 (via Vapi)
Industry-leading latency
Telephony
Twilio (via Vapi)
Industry standard, best docs
Billing
Stripe
Subscription + metered billing
File storage
Cloudflare R2
Zero egress fees — saves $$ on audio playback
Background jobs
Cloudflare Queues + Cron Triggers
Native to Workers, no extra services
Email
Resend (via Worker)
Transactional + alerts
SMS
Twilio
Already in stack
Monitoring
Cloudflare Workers Analytics + Sentry
Built-in observability + error tracking
DNS, CDN, WAF
Cloudflare
Single provider, free SSL, DDoS protection included
Hosting
Cloudflare Workers + Pages
Global edge, 300+ locations, simple deploys via Wrangler
7.2 Database Schema (Core Tables)
Simplified for clarity. Schema is intentionally generic enough to support outbound in Phase 2 without major restructuring.
users
id, email, name, stripe_customer_id, plan_tier, credits_remaining, created_at
organizations
id, name, owner_user_id, plan_tier, location_count, created_at
organization_members (multi-user accounts)
id, organization_id, user_id, role [owner | manager | staff | viewer], invited_at, accepted_at
agents
id, business_id, name, type, system_prompt, first_message, voice_id, vapi_assistant_id, status, version, created_at
agent_versions (versioning)
id, agent_id, system_prompt, first_message, voice_id, published_at, published_by_user_id
voices (admin-managed)
id, organization_id, elevenlabs_voice_id, name, sample_url, consent_recording_url, approved_by_admin_id, status, created_at
businesses
id, organization_id, business_name, address, hours_json, existing_phone_number, twilio_forwarding_number, vertical, integrations_json
knowledge_base_documents
id, business_id, file_name, file_type, r2_url, size_bytes, indexed_at, vector_namespace
calls
id, business_id, agent_id, direction, phone_number, duration_seconds, cost_cents, transcript, recording_r2_url, outcome, flagged, quality_score, is_test, created_at
audit_logs
id, organization_id, user_id, action, resource_type, resource_id, before_value, after_value, ip_address, created_at
webhooks
id, organization_id, url, events_subscribed, secret_token, last_success_at, last_failure_at, status
webhook_deliveries
id, webhook_id, event_type, payload, response_code, attempts, delivered_at, dead_letter_at
promo_codes
id, code, discount_type [percent | fixed], discount_value, max_redemptions, redemptions_used, expires_at, created_by_admin_id, applies_to_plan_tier
promo_redemptions
id, promo_code_id, organization_id, redeemed_at, applied_to_subscription_id
demo_calls (homepage demo agent)
id, caller_id, ip_address, business_name_entered, duration_seconds, transcript, ended_naturally, created_at
voice_clone_requests
id, organization_id, sample_r2_url, consent_recording_r2_url, status [pending | approved | rejected], reviewed_by_admin_id, reviewed_at, rejection_reason, elevenlabs_voice_id
first_call_review_window (30-day concierge tracking)
id, organization_id, started_at, ends_at, calls_reviewed_count, escalations_count
7.3 Cost Per Call (Stack Economics)
Component
Provider
Rate
Cost per 90-sec call
Telephony (inbound)
Twilio
$0.0085/min
$0.013
Speech-to-text
Deepgram Nova-3
$0.0077/min
$0.012
LLM
Groq Llama 3.3 70B
Free tier covers
~$0.0005
Voice synthesis
ElevenLabs Flash v2.5
~$0.30/1K chars
$0.020
Orchestration
Vapi
$0.05/min
$0.075
Total per call


$0.121
At $99/mo Starter plan with 300 included minutes, average client uses ~150 minutes (100 calls of 90 sec). Cost to serve: ~$12. Gross margin: 88%.
7.4 Frontend Architecture
Two separate Next.js apps: the customer-facing app at yourdomain.com and the internal admin tool at admin.yourdomain.com. Both deploy to Cloudflare Pages and follow the same architectural patterns, but with different design language (Stripe-style for customer, Linear-style for admin).
7.4.1 Stack and Conventions
Layer
Choice and rationale
Framework
Next.js 15 with App Router — server components by default, client components only for interactivity. Stable, well-documented, plays well with Cloudflare Pages.
UI components
shadcn/ui — components copied into our repo (we own the code), not installed from npm. Built on Radix UI primitives for accessibility (WAI-ARIA compliant).
Styling
Tailwind CSS only. No custom CSS unless absolutely necessary. Tailwind config defines our design tokens.
Server state
TanStack Query (React Query) — caching, background refetching, optimistic updates, mutation handling
UI state
Zustand for cross-component state. useState for component-local state. No Redux.
Forms
React Hook Form + Zod for validation. Same Zod schemas reused on the backend (single source of truth).
Routing
Next.js App Router with route groups for layouts. Authenticated routes guarded by middleware.
Real-time updates
Server-Sent Events (SSE) for live call updates — works on Cloudflare Workers, simpler than WebSockets
Charts
Recharts (works with shadcn/ui charts) for analytics dashboards
Icons
Lucide React — clean, consistent icon set used by shadcn/ui
Data tables
TanStack Table v8 with shadcn/ui wrappers — sorting, filtering, pagination, column visibility
Toasts/notifications
Sonner (shadcn/ui default) for transient notifications
Date handling
date-fns — lightweight, immutable, tree-shakeable
Reference templates the Frontend Agent should study before building: next-shadcn-dashboard-starter (Kiranism, 6,000+ stars on GitHub) for layout patterns, shadcn/ui official examples for component usage, and ShadcnStore dashboard template for production patterns.
7.4.2 Folder Structure (Customer App)
Located at /apps/web in the monorepo:
/apps/web/app/ — Next.js App Router pages and layouts
/apps/web/app/(marketing)/ — public marketing site routes (home, pricing, faq)
/apps/web/app/(auth)/ — auth routes (signup, login, password reset)
/apps/web/app/(dashboard)/ — authenticated customer dashboard routes
/apps/web/app/api/ — Next.js API routes (only used for proxying to Workers when needed)
/apps/web/components/ — shared components (forms, tables, modals)
/apps/web/components/ui/ — shadcn/ui primitives (button, input, dialog, etc.)
/apps/web/components/dashboard/ — dashboard-specific components
/apps/web/components/marketing/ — marketing-specific components (hero, pricing, demo widget)
/apps/web/lib/ — utilities, hooks, API client
/apps/web/lib/api/ — typed API client with TanStack Query hooks
/apps/web/styles/ — globals.css with Tailwind directives
7.4.3 Design Language: Customer Dashboard (Stripe-Inspired)
Why Stripe: Stripe's dashboard is the gold standard for trustworthy SMB-facing financial-adjacent SaaS. SMB owners trust Stripe-looking interfaces with their money and operations. We borrow this trust signal.
Aspect
Specification
Background
White (#FFFFFF) primary, light gray (#FAFAFA) secondary
Primary color
Indigo-600 (#4F46E5) for primary actions and brand
Text
Slate-900 for primary, Slate-600 for secondary, Slate-400 for muted
Success
Green-600 — used sparingly for confirmations
Warning
Amber-500 — for usage warnings, payment issues
Danger
Red-600 — for destructive actions, errors
Typography
Inter font (system fallback to -apple-system) — sizes 12, 14, 16, 18, 24, 32
Spacing
4px base unit — Tailwind defaults (1, 2, 3, 4, 6, 8, 12, 16, 24)
Borders
1px Slate-200 — soft, low-contrast
Shadows
Minimal — shadow-sm on cards, shadow-md on modals only
Border radius
rounded-md (6px) default, rounded-lg (8px) for cards
Layout grid
Max width 1280px content area, sidebar 240px, header 64px
Density
Comfortable — 16px base font, 16-20px padding in cards
Dark mode
Not in V1 (light mode only) — defer to V2 if customer demand warrants
7.4.4 Design Language: Admin Tool (Linear-Inspired)
Why Linear: Linear's UI is the gold standard for power-user internal tools. Dense, fast, keyboard-driven. Our admin tool is used by us (the founder/team) to manage 100s of customers — speed and density matter more than approachability.
Aspect
Specification
Background
Slate-50 primary, white for cards
Primary color
Slate-900 for primary actions (high contrast, low color)
Accent
Indigo-600 used minimally for active states
Density
Compact — 14px base font, 8-12px padding
Tables
Information-dense tables with inline actions, hover states, keyboard navigation
Keyboard shortcuts
First-class — Cmd+K for command palette, J/K for row navigation
Layout
Wider content area (1440px), narrow sidebar (200px)
Empty states
Minimal — no illustrations, just clear text + action
Modals
Slide-over panels for detail views (not center modals)
Dark mode
Light mode V1, dark mode in V1.1 (admin power users want it)
7.4.5 Responsive Breakpoints
Tailwind defaults used: sm 640px, md 768px, lg 1024px, xl 1280px, 2xl 1536px.
Marketing site: mobile-first design (visitors check on phones)
Customer dashboard: responsive but desktop-first (configuration happens on desktop, monitoring on mobile)
Customer dashboard call log + call detail: fully mobile-optimized (most-checked screens on phone)
Onboarding wizard: desktop-recommended (uploading menu PDFs, configuring agents) — show 'better on desktop' notice on mobile
Admin tool: desktop-only (1280px minimum width) — explicit 'this tool requires desktop' message on mobile
7.4.6 Empty, Loading, and Error States
Every screen specifies all three states. No bare loading spinners, no generic 'something went wrong' errors.
Empty state: explanation + primary action (e.g., 'No calls yet — try a test call now')
Loading state: skeleton screens that match the layout, not blank with spinner
Error state: clear explanation + retry action + escalation path (contact support)
Optimistic updates: form submissions show success immediately, roll back on error
Toast notifications for transient feedback (success, error, info) — auto-dismiss after 4 seconds
7.5 Backend Architecture
Single Cloudflare Worker for V1, but organized internally with clear service boundaries so we can split into multiple Workers later without refactoring business logic.
7.5.1 Stack and Conventions
Layer
Choice and rationale
Runtime
Cloudflare Workers — fast cold starts, global edge, 30s wall clock per request, free tier covers MVP
Web framework
Hono — fast, lightweight, TypeScript-first, designed for edge runtimes
API style
Hybrid: tRPC for internal frontend ↔ backend (type-safe, fast iteration), REST for webhooks (Stripe, Vapi, Twilio) and future public API
Validation
Zod schemas — same schemas reused on frontend (React Hook Form) and backend (request validation)
Database
Cloudflare D1 (SQLite at edge) via Drizzle ORM — type-safe queries, lightweight migrations
File storage
Cloudflare R2 — zero egress fees for recordings, knowledge base PDFs, voice samples
Vector DB
Cloudflare Vectorize — knowledge base RAG (free tier covers MVP)
Cache/sessions
Cloudflare KV — rate limits, session tokens, feature flags
Background jobs
Cloudflare Queues — webhook delivery, email sending, audio processing
Auth
Better Auth (customer-facing) + Cloudflare Access (internal admin)
Logs/monitoring
Cloudflare Logpush → S3-compatible storage, Sentry for errors, Better Stack for uptime
7.5.2 Service Boundaries
All services live in a single Worker codebase but are isolated as separate modules with clear interfaces. Each service has its own folder under /apps/api/src/services/.
Service
Owns
auth
Signup, login, sessions, OAuth, password reset, MFA, role-based access checks
billing
Stripe subscriptions, plan changes, usage tracking, invoice generation, failed payment handling
agents
Agent configuration, system prompts, voice selection, agent versioning
calls
Call records, webhook handlers from Vapi, transcripts, recordings, quality grading
knowledge_base
PDF upload, chunking, embedding, Vectorize indexing, query retrieval during calls
integrations
Vapi, ElevenLabs, Twilio, Stripe, Deepgram, Groq, OpenTable, Resy, Google Calendar
notifications
SMS, email, Slack, generic webhooks — all outbound communications
admin
Admin tool API endpoints — impersonation, edit-any-account, audit logs, voice cloning queue
demo
Public homepage demo agent — call routing, rate limiting, conversion tracking
7.5.3 Folder Structure (Backend)
/apps/api/src/index.ts — Hono app entry, middleware setup, route registration
/apps/api/src/services/[service-name]/ — one folder per service (auth, billing, agents, etc.)
/apps/api/src/services/[name]/routes.ts — Hono router with REST endpoints
/apps/api/src/services/[name]/handlers.ts — request handlers (thin, delegate to logic)
/apps/api/src/services/[name]/logic.ts — business logic (no HTTP, testable in isolation)
/apps/api/src/services/[name]/schemas.ts — Zod schemas for request/response validation
/apps/api/src/middleware/ — auth, logging, rate limiting, CORS, error handling
/apps/api/src/integrations/ — external API clients (one file per service: vapi.ts, stripe.ts, etc.)
/apps/api/src/queues/ — background job consumers
/apps/api/src/utils/ — shared utilities
7.5.4 Middleware Stack
Every request flows through these middleware layers in order:
CORS — allow customer dashboard origin, deny others
Request ID — assign unique ID for tracing
Logger — log request method, path, duration, status
Rate limiter — Cloudflare Workers rate limiting based on IP / user / endpoint
Auth — verify session token (Better Auth) or webhook signature
Authorization — verify role/permissions for protected actions
Handler — actual route logic
Error handler — convert thrown errors to structured JSON responses
7.5.5 Background Jobs (Cloudflare Queues)
Long-running or unreliable work goes through queues, never blocking the response.
webhook-delivery: send webhooks to customer endpoints with retry logic
email-send: transactional emails via Resend
kb-indexing: chunk uploaded PDFs and index into Vectorize
call-grading: random sampling and LLM-based quality grading
usage-aggregation: roll up call minutes for billing at end of day
digest-emails: weekly digest generation and send (cron-triggered)
7.5.6 Observability
Structured logging: JSON logs with request_id, user_id, organization_id, latency, status
Sentry: error tracking with stack traces, source maps, breadcrumbs
Better Stack: uptime monitoring + status page (https://status.yourdomain.com)
Cloudflare Analytics: built-in request analytics by route, status, region
Custom metrics: emit counters/timings to Cloudflare Logpush, query in dashboards
Distributed tracing: request_id propagated through Vapi webhooks → our backend → external APIs
7.6 API Design Conventions
Standardized conventions across all endpoints. Every agent in the build team must follow these rules. Documented in /docs/API.md and enforced through code review.
7.6.1 REST Endpoints (Webhooks and Public API)
Resource naming: plural nouns (/calls, /agents, /organizations)
HTTP methods: GET (read), POST (create), PATCH (partial update), DELETE (remove). PUT not used.
Status codes: 200 (success), 201 (created), 204 (no content), 400 (validation), 401 (auth), 403 (forbidden), 404 (not found), 429 (rate limited), 500 (server error)
Versioning: URL prefix /v1/ — bump to /v2/ for breaking changes only
Pagination: cursor-based with ?cursor=xxx&limit=50 — never offset-based (slow on large tables)
Filtering: query params with explicit names (?status=active&from_date=2026-01-01) — never generic ?filter[]
Sorting: ?sort=created_at:desc — single field only in V1
7.6.2 Standardized Error Response
Every error response from any endpoint follows this exact shape:
{ "error": { "code": "VALIDATION_ERROR", "message": "Human-readable message", "details": {...optional...}, "request_id": "req_abc123" } }
code: machine-readable error code in SCREAMING_SNAKE_CASE
message: human-readable, safe to show to end users
details: optional context (e.g., field-level validation errors)
request_id: for support — customer can give us this and we find the exact request
7.6.3 Idempotency for Webhooks
All inbound webhooks (Vapi, Stripe, Twilio) are idempotent. Receiving the same event twice produces the same result.
Each webhook includes a unique event ID from the source
We store processed event IDs in KV with 7-day TTL
Duplicate event IDs are acknowledged with 200 but skipped
Outbound webhooks (us → customer) include an Idempotency-Key header for the customer to deduplicate on their side
7.6.4 tRPC Endpoints (Internal Frontend ↔ Backend)
Used for the customer dashboard and admin tool. Type-safe across the wire, no manual API client maintenance.
Routers organized by service (callsRouter, agentsRouter, billingRouter)
Procedures: query (read), mutation (write), subscription (real-time via SSE)
Input validation via Zod
Output types inferred end-to-end — frontend gets full types from backend without code generation
Auth: every procedure has a context object with current user/org
Errors: tRPC's TRPCError class maps to standardized error codes
7.6.5 Authentication and Authorization
Customer auth: Better Auth issues HTTP-only session cookies (SameSite=Strict, Secure, 30-day expiry)
Admin auth: Cloudflare Access SSO + mandatory MFA, 1-hour session expiry, IP-restricted to known offices/VPNs
Webhook auth: HMAC signature verification using shared secrets per source (Vapi, Stripe, Twilio each have their own)
Permission checks: every protected endpoint verifies role and resource ownership before executing
Multi-location: location-scoped permissions checked at the resource level (can this user view this location's calls?)
7.6.6 Real-Time Updates (Server-Sent Events)
When a call ends, the dashboard should update without a page refresh. SSE is simpler than WebSockets and works well on Cloudflare Workers.
Endpoint: GET /v1/events/stream — long-lived connection, sends events as they happen
Event types: call.started, call.ended, call.flagged, usage.threshold (50%/80%/100%), webhook.failed
Frontend: TanStack Query invalidates relevant caches on receiving events
Fallback: if SSE connection drops, frontend polls every 30s until reconnect
Connection limit: max 1 SSE connection per user session
7.7 Competitive UX Reference
Studied competitors and what we learn from each. The Frontend Agent should review these before building the corresponding screens.
Competitor
What they do well
What we copy / differentiate
Slang.ai
Pre-programmed questions per restaurant type, 30-min onboarding call, OpenTable native
Copy: vertical templates approach. Differentiate: self-serve onboarding (no 30-min call required)
PolyAI
Enterprise polish, voice quality, 70% call resolution rate, multi-location config
Copy: voice quality bar (use ElevenLabs Flash v2.5). Differentiate: SMB pricing vs enterprise sales cycle
Loman AI
Affordable for small/mid restaurants, simultaneous call handling, POS integrations
Copy: simple pricing tiers. Differentiate: more verticals, better voice cloning
Hostie AI
Omnichannel (calls + texts + reservations), 20-language support, restaurant-operator-built
Copy: multi-language ambition. Differentiate: voice-first (not omnichannel) for clarity
Stripe Dashboard
Trustworthy financial UI, calm density, excellent empty states, fast page transitions
Copy: design language for customer dashboard
Linear
Power-user density, keyboard-first, Cmd+K command palette, slide-over detail panels
Copy: design language for internal admin tool
Cal.com
Multi-tenant scheduling, integrations marketplace, open-source patterns we can study
Reference: multi-location org structure, team permissions
Retool
Internal tool patterns, dense data tables with inline actions, audit logs
Reference: admin tool feature inventory
7.7.1 Reference Open-Source Templates
Concrete repositories the Frontend Agent and Admin Tool Agent should study before writing code:
next-shadcn-dashboard-starter (github.com/Kiranism/next-shadcn-dashboard-starter, 6,000+ stars) — production-ready dashboard layout with sidebar, topbar, charts, tables, auth, billing, team management. Best baseline for our admin tool.
next-forge (next-forge.com, 6,900+ stars) — opinionated SaaS monorepo template with auth, payments, analytics, webhooks all wired up. Good reference for monorepo structure even though we will not adopt all their tooling choices.
shadcn/ui official examples (ui.shadcn.com/examples) — dashboard, mail, tasks, music app — reference implementations of common UI patterns.
Cal.com (github.com/calcom/cal.com) — open-source scheduling SaaS, multi-tenant, has patterns we can study for organization/team structure.
Inbox Zero (github.com/elie222/inbox-zero) — open-source AI-powered email management. Reference for AI-augmented SaaS UX patterns.
Concrete approach: Frontend Agent clones next-shadcn-dashboard-starter into a /reference folder (gitignored), studies the patterns, then builds our app from scratch following those patterns. Do not fork — we own all our code.
7.8 Wireframes — Critical Screens
These wireframes describe the layout and content of the most important screens. Reference the design language tables (7.4.3 customer Stripe-style, 7.4.4 admin Linear-style) for visual styling. Reference the competitor and open-source templates in Section 7.7 for proven patterns.
These are layout specifications, not pixel-perfect mockups. The Frontend Agent should follow the structure exactly but make sensible choices for spacing, exact wording, and minor details using shadcn/ui defaults.
How to read these wireframes
Each section header (TOP BAR, SIDEBAR, MAIN, etc.) describes a region of the screen. Bullets within describe the components in that region, in order from top to bottom or left to right. State variations (empty, loading, error) are listed at the end of each screen.
7.8.1 Marketing Homepage (with Demo Widget)
URL: yourdomain.com — the most important conversion screen on the entire site. Visitors who try the demo here are far more likely to sign up than those who don't.
Reference: Stripe homepage for hero pattern, Linear homepage for clean density, Slang.ai for restaurant-vertical credibility signals.
HEADER (sticky, transparent on scroll)
Logo on left (just text, e.g., 'Receptionist' in Inter Bold)
Center nav: Product, Pricing, Use Cases, Customers, FAQ
Right: 'Sign in' link + 'Get Started' button (Indigo-600)
HERO SECTION (full-width, ~80vh on desktop)
H1 left-aligned, max-width 600px: 'The AI receptionist that actually answers your phone.'
Subheading: 'Stop missing 30% of your calls. Set up a 24/7 AI receptionist for your restaurant, salon, or clinic in 30 minutes.'
PRIMARY CTA — large prominent box: 'Try it now — talk to Maria, our demo receptionist'
Inside the CTA box: phone number '+1 (555) 555-DEMO' (large, click-to-call on mobile)
Below the phone number: 'Or try from your browser →' button (triggers Vapi Web SDK call)
Optional input: 'Make it your business — enter your name' → personalizes the demo greeting
Trust microcopy below CTA: '3-minute demo, no signup needed'
RIGHT side of hero: animated illustration of a phone with chat bubbles showing live conversation snippets
SOCIAL PROOF STRIP
Below hero: row of placeholder logos with caption 'Trusted by 100+ restaurants and shops' (replace with real logos as customers come in)
Single statistic: 'Restaurants miss 30% of incoming calls. We answer 100%.'
PROBLEM SECTION
Section heading: 'You're losing money every time the phone rings.'
3 illustrated cards in a row: (1) Missed calls = missed reservations, (2) Hold music kills bookings, (3) Hiring receptionists is expensive
Each card: icon (Lucide), 1 sentence, 1 stat
HOW IT WORKS SECTION
Section heading: 'Set up in 30 minutes. Live in an hour.'
3 steps with screenshots/illustrations: (1) Tell us about your business, (2) Customize your AI receptionist, (3) Forward your calls
Below: 'Watch a 2-minute walkthrough' video embed (Loom-style)
FEATURES GRID (6 cards in 2x3 grid)
Real Conversations (not menu trees), Vertical Templates, Knowledge Base, Integrations, Analytics, 24/7 Reliability
Each card: Lucide icon, 2-line headline, 2-line description
PRICING TEASER
Section heading: 'Simple, predictable pricing'
4 plan cards (Starter, Growth, Pro, Multi-location) with prices and key features
CTA: 'See full pricing →'
FAQ SECTION (accordion)
8-10 questions: How does forwarding work? Will my customers know it's AI? Can I edit what it says? What happens during peak hours? etc.
FINAL CTA SECTION (just before footer)
Section heading: 'Ready to stop missing calls?'
Demo CTA again (same as hero) + 'Get started' button
FOOTER
4 columns: Product (features, pricing, integrations), Company (about, blog, contact), Legal (terms, privacy, refund policy), Support (help center, status page, system status indicator)
Bottom: copyright, social icons, country/language picker
MOBILE BEHAVIOR
Hero stacks vertically, illustration moves below CTA
Phone number becomes a tap-to-call link
Browser call button works but is secondary
Nav collapses into hamburger menu
7.8.2 Onboarding Wizard (7 Steps)
URL: app.yourdomain.com/onboarding — completed once per new customer. Should feel guided, not overwhelming.
Reference: Stripe onboarding for trust-building tone, Linear onboarding for density, Vercel deploy flow for clear progress.
PERSISTENT LAYOUT (all 7 steps share this)
LEFT SIDEBAR (240px wide, fixed): step list 1-7 with current step highlighted, completed steps with checkmark, 'Save & exit' link at bottom
TOP BAR (within main area): step number + title (e.g., 'Step 3 of 7: Pick a Voice'), progress bar (35% filled), 'Skip for now' link if step is optional
MAIN CONTENT AREA (centered, max-width 720px): step-specific content
FOOTER BAR (sticky bottom): 'Back' button (left), 'Continue' button (right, disabled if required fields missing), help link 'Need help? Talk to a human →'
HELP VIDEO BUTTON (top-right corner, persistent): opens 2-3 minute Loom-style walkthrough for current step
STEP 1: Business Details
Heading: 'Tell us about your business'
Form fields: Business name, address (with autocomplete), existing phone number, website (optional), brief description (textarea, 200 char max)
Hours of operation: 7-day grid with open/close time pickers, 'Closed' toggle per day
STEP 2: Phone Setup
Heading: 'How do you want callers to reach your AI?'
Two large radio cards: (A) Forward my existing number (recommended) — keeps your phone number, calls forward to AI, (B) Get a brand new number — we provision a Twilio number in your area code
If A selected: shows existing number, explains forwarding will be set up in Step 7
If B selected: shows 3 available numbers in their area code, customer picks one
STEP 3: Pick a Voice
Heading: 'Choose your AI's voice'
Grid of 12 voice cards (3 columns, 4 rows): each card has voice name, brief description (e.g., 'Maria — warm, friendly, American English'), Play button to preview a 10-second sample
Selected voice highlighted with Indigo border
Note at bottom: 'Want to clone your own voice? Available on Pro and Multi-location plans — contact support after setup.'
STEP 4: Knowledge Base (Optional)
Heading: 'Upload your menu, FAQ, or other reference docs'
Subheading: 'Your AI will use these to answer customer questions accurately. Skip and add later if not ready.'
Drag-and-drop upload zone (large, dashed border)
List of uploaded files below: filename, size, status (indexing / ready), delete button
Quota indicator: '12 MB of 25 MB used'
STEP 5: Customize the Agent
Heading: 'Customize what your AI says'
LEFT side: prompt editor (textarea, monospace font, ~15 rows). Pre-filled with vertical template based on signup choice
RIGHT side: 'Live preview' panel showing example interactions
Below editor: 'First message' field (what AI says when it answers)
Capability toggles below: Take reservations, Take orders, Answer menu questions, Take messages, Transfer to human (with phone number to transfer to)
Locked toggle (cannot be disabled): 'Refuse legal/medical/financial advice — always defer to a professional'
STEP 6: Test Call
Heading: 'Try it out — call yourself'
Form: 'Your cell phone number' (with country code dropdown)
Verification flow: enter number → receive SMS code → verify
Big button: 'Call me now from my AI' — triggers a real Vapi call to verified number
Status indicator: 'Calling... pick up your phone'
After call: 'How did it go?' with thumbs up/down + free-text feedback
Note: 'Test calls count against your plan minutes (real Vapi calls)'
STEP 7: Activate Forwarding
Heading: 'Forward your business line to your AI'
Auto-detected carrier shown: 'We detected you're with AT&T'
Carrier-specific instructions in numbered steps with illustrations
Big button: 'I've set it up — verify forwarding'
Verification: system calls the customer's existing number, confirms it routes to AI, shows green checkmark
If verification fails: 'We didn't detect forwarding yet. Try the steps again, or contact support.' with retry button
COMPLETION SCREEN
Big checkmark icon, heading: 'You're live! Your AI is now answering calls.'
CTA button: 'Go to dashboard →'
Secondary: 'Make a real call to your business now to see it work'
MOBILE BEHAVIOR
Sidebar collapses to hamburger menu showing step list
Step content stacks vertically
Show banner: 'Onboarding works best on desktop — would you like a link sent to your computer?'
7.8.3 Dashboard Home (Customer)
URL: app.yourdomain.com/dashboard — the screen owners see most often. Goal: 60-second skim shows them exactly what their AI did today.
Reference: Stripe Dashboard home for stat-card pattern, Slang.ai dashboard for restaurant-relevant metrics.
PERSISTENT LAYOUT
LEFT SIDEBAR (240px, collapsible): logo at top, primary nav (Today, Calls, Agent, Knowledge Base, Integrations, Team), divider, secondary nav (Settings, Billing, Help), business switcher at bottom for multi-location
TOP BAR (64px): page title 'Today', date selector (Today / Yesterday / This week / Custom), search bar (Cmd+K to open), profile dropdown right
MAIN CONTENT (max-width 1280px, centered)
HERO STATS ROW (4 cards)
Card 1: 'Calls today' — big number (e.g., 47), small delta vs yesterday (+12%, green)
Card 2: 'Reservations / orders captured' — big number (e.g., 12), 'View details →'
Card 3: 'Quality score' — score out of 100 (e.g., 94), trend arrow
Card 4: 'Plan usage' — '150 of 200 minutes (75%)', progress bar, upgrade link if >80%
FLAGGED CALLS BANNER (only if flagged calls exist)
Amber-bordered banner: '2 calls were flagged for review' with 'Review now →' button
CALL TIMELINE (today's calls list)
Section heading: 'Today's calls' with filter pills (All / Reservations / Info / Transferred / Flagged)
Each call row: caller phone (formatted), duration, time of call, outcome badge, key extract from transcript (e.g., 'Booked table for 4 at 7pm Sat'), 'Listen' button (audio player inline), 'View details' link
Hover: row highlights, action buttons appear (flag, share, copy transcript)
Empty state: 'No calls yet today. Try a test call →'
OUTCOMES BREAKDOWN (right sidebar widget)
Pie or donut chart: percentage breakdown of call outcomes today
Below chart: top 3 caller intents from transcript analysis (e.g., 'Hours/location: 18 calls', 'Reservation: 12', 'Menu question: 8')
WEEKLY DIGEST PREVIEW (bottom card)
'Your Monday digest is ready' card with summary preview and 'Read full digest' link
MOBILE BEHAVIOR
Sidebar becomes drawer (hamburger trigger)
Hero stats stack 2x2 instead of 1x4
Call timeline becomes card list, audio player still works
Outcomes widget moves below call timeline
STATE VARIATIONS
Empty: just-onboarded customer with no calls — shows 'Make your first test call' CTA, walks through what the dashboard will show
Loading: skeleton screens for stats and call list
Error: 'Couldn't load today's data — try refreshing' with retry button, error doesn't break navigation
7.8.4 Call Log + Call Detail
URL: app.yourdomain.com/calls (log) and /calls/[id] (detail) — owners use this to investigate specific calls.
Reference: Linear issue list for density, Stripe payments list for filtering, Gmail message detail for transcript layout.
CALL LOG VIEW
TOP BAR: page title 'All calls', date range picker, export CSV button
FILTER BAR (sticky below top bar): filter pills for outcome (All / Reservation / Order / Info / Transfer / Flagged), search input (caller phone, transcript text), more filters dropdown (duration range, quality score)
DATA TABLE (TanStack Table with shadcn/ui): columns are Time, Caller, Duration, Outcome, Quality, Actions
Each row clickable, opens call detail (same page slide-over panel on desktop, full page on mobile)
Bulk select with checkboxes, bulk actions: flag, export selected, delete recordings (admin only)
Pagination: cursor-based, shows '1-50 of 247 calls'
Empty filtered state: 'No calls match these filters — clear filters'
CALL DETAIL VIEW (slide-over from right on desktop, full page on mobile)
HEADER: caller phone (large, formatted), call time/date, duration, outcome badge, X to close
ACTION BAR: Flag this call, Listen to recording, Download recording, Share with team, Copy transcript
AUDIO PLAYER: full-width audio player with waveform, playback speed (1x, 1.5x, 2x), 30-second skip back/forward, current timestamp
TRANSCRIPT (chat-style): each turn shown as message bubble, AI on left (gray), caller on right (white with border), timestamp on each, key actions highlighted (e.g., 'Reservation booked' green chip inline)
EXTRACTED INFO PANEL: structured data the AI captured (caller name, callback number, intent, etc.)
OUTCOME SECTION: detected outcome with confidence score, owner can override
INTEGRATION ACTIONS (if applicable): if call resulted in reservation, show 'Sent to OpenTable ✓' with link
OWNER NOTES: free-text field for owner to add notes about this call (saved to call record)
MOBILE BEHAVIOR
Log table converts to card list — each call is a card showing time, caller, duration, outcome
Detail opens as full-screen page (back button in top bar)
Audio player remains prominent at top of detail view
STATE VARIATIONS
Recording unavailable: 'Recording was deleted (older than retention)' message
Transcript still processing: 'Transcript will be ready in ~30 seconds' with auto-refresh
Call mid-flight: live transcript streaming in real time via SSE
7.8.5 Agent Builder
URL: app.yourdomain.com/agent — where owners customize what their AI says and does. Most-used config screen.
Reference: OpenAI playground for prompt + preview side-by-side, Notion editor for clean writing experience, Vapi dashboard for voice AI configuration patterns.
LAYOUT (split-pane on desktop, tabs on mobile)
LEFT PANE (60% width): prompt editor and configuration
RIGHT PANE (40% width, sticky): live preview and test panel
LEFT PANE — CONFIGURATION
TOP TABS: Agent Settings | Capabilities | Voice & Greeting | Knowledge Base | Versions
Tab: Agent Settings (default)
Section: 'System prompt' — large monospace textarea, ~25 rows, with vertical template indicator (e.g., 'Restaurant template v1.2')
Locked section at bottom of textarea (gray, non-editable): 'Built-in safety rules — these cannot be removed: never give legal/medical/financial advice; never invent prices; never make promises on behalf of the business'
Save controls at top right: 'Save draft' (saves but doesn't publish) and 'Publish live' (deploys to active agent — confirmation modal)
Status indicator: 'Live version: v3 — published 2 days ago'
Tab: Capabilities
Toggle list: Take reservations (with link to OpenTable/Resy config), Take orders (with format settings), Answer menu questions (auto-on if KB exists), Take messages (always on), Transfer to human (with phone number field)
Each toggle: name, 1-line description, on/off switch, 'Configure →' if needs setup
Tab: Voice & Greeting
Voice picker (same 12 voices grid as onboarding)
First message field with variable insertion: '{{business_name}}' chip
Closing message field
Voice cloning section: 'Cloned voice: not available on your plan' OR 'Cloned voice: Approved (Maria — your voice)' OR 'Cloned voice: Pending review' OR 'Request cloned voice →' button (Pro+ only)
Tab: Knowledge Base
File upload zone + uploaded files list (same pattern as onboarding Step 4)
Quota indicator: '12 MB of 25 MB used'
Per file: 'Preview what AI sees' link → opens modal showing extracted text chunks the AI will reference
Tab: Versions (history)
Timeline of agent versions: each entry shows version number, published date, who published, brief change summary
Each entry: 'View' button → diff modal showing what changed, 'Roll back to this version' button
RIGHT PANE — LIVE PREVIEW
Header: 'Test your AI'
Tab 1 — Scripted scenarios: 'Try common scenarios' with buttons like 'Reservation request', 'Allergen question', 'Hours request', 'Complaint' — clicking simulates a conversation in the preview pane
Tab 2 — Live test call: same flow as onboarding Step 6, places a real call to verified phone
Tab 3 — Browser call: in-browser voice test using Vapi Web SDK (works without phone)
Conversation preview: chat-style turns showing AI responses, expandable to see full reasoning
ADMIN APPROVAL FLAG (when applicable)
If owner edits prompt in a way that weakens safety: yellow banner appears: 'This change is queued for admin review (typically within 24 hours). Your live agent continues to use the previous version.'
STATE VARIATIONS
First-time empty: agent has the vertical template pre-filled, walkthrough overlay highlights key sections
Saved changes: yellow 'unsaved changes' indicator on Save button
Save error: toast notification 'Could not save — check your prompt for issues' with details
7.8.6 Admin: Customer Detail + Impersonation
URL: admin.yourdomain.com/customers/[id] — internal tool for support and troubleshooting. Used by founder/team daily.
Reference: Linear issue detail for density, Retool admin patterns for tabbed config, Stripe customer detail for billing operations.
LAYOUT (Linear-style, dense, desktop-only)
LEFT SIDEBAR (200px, collapsed by default): admin navigation — Customers, Voice Cloning Queue, Flagged Calls, Audit Log, Promo Codes, System Health
TOP BAR (48px, dense): breadcrumb (Customers / Mario's Pizza), search (Cmd+K), admin user dropdown right with MFA status indicator
MAIN AREA: customer detail with multiple tabs
CUSTOMER HEADER (sticky)
Business name + plan badge (e.g., 'Pro Plan'), customer ID (clickable to copy)
Quick stats row: MRR, signup date, total calls, last login, churn risk score
Action buttons (right): 'Impersonate ↗' (high-priority, indigo), 'Issue refund', 'Apply credit', 'Suspend service', 'More actions ▾' (delete, change plan, etc.)
TABS (horizontal, dense)
Overview | Calls | Agent Config | Knowledge Base | Billing | Team | Audit | Notes
Tab: Overview
3-column dense info grid: Business Info (name, address, hours), Plan & Usage (plan tier, minutes used, billing cycle), Status (forwarding active y/n, agent live y/n, last call timestamp)
Recent calls table (last 20)
Sticky notes from previous admin sessions visible in right column
Tab: Agent Config (editable)
Same UI as customer agent builder, but with admin-mode banner: 'You are editing as ADMIN. Changes will be logged and customer will be notified.'
Edit any field, save publishes immediately
Diff view: 'Show what's changed' button shows changes since last admin edit
Tab: Billing
Stripe customer info embed: subscription status, next charge date, payment method, invoice history
Quick actions: Issue refund (with reason field), apply credit, change plan, cancel
Failed payment status if any
Tab: Audit (read-only)
Searchable audit log scoped to this customer: action, who did it, when, before/after values
Filter by action type (config change, login, billing, admin impersonation)
IMPERSONATION FLOW
Admin clicks 'Impersonate ↗' button
Modal: 'You are about to log in as [customer name]. The customer will receive an email notification. Reason for impersonation:' — required text field
Admin types reason (e.g., 'debugging webhook delivery issue ticket #234')
Click 'Start impersonation session' — opens new tab as that customer
In customer dashboard: red banner at top — 'You are impersonating [customer]. Click here to end session.'
Session auto-expires after 1 hour
Audit log entry created automatically
Customer receives email: 'Our support team accessed your account at 2:34pm — reason: debugging webhook delivery'
STATE VARIATIONS
Customer suspended: red banner, all edit actions disabled, only 'Reactivate' button available
Customer churned: gray theme, read-only mode, 'Reactivate within 30-day grace period' button if applicable
Impersonation already active by another admin: warning banner 'Sarah is currently impersonating this account — only one impersonation at a time'
7.8.7 Admin: Voice Cloning Queue
URL: admin.yourdomain.com/voice-cloning — review and approve voice cloning requests. Manual gate to prevent abuse.
Reference: Stripe Radar for review queue UX, content moderation tools for approve/reject patterns.
LAYOUT
Same admin sidebar and top bar as Customer Detail
Page title: 'Voice Cloning Queue' with count badge (e.g., '3 pending')
FILTER TABS
Pending (default) | Approved | Rejected | All
REQUEST LIST (dense table)
Columns: Submitted At, Customer, Plan, Sample Quality (auto-detected), Status, Actions
Each row clickable, opens detail panel (slide-over from right)
REQUEST DETAIL PANEL
HEADER: customer name + 'View customer →' link, plan badge, submission timestamp
VOICE SAMPLE SECTION: audio player with waveform, sample duration, file size, 'Download sample' button
CONSENT RECORDING SECTION: separate audio player for the consent phrase, transcript shown ('I, John Smith, consent to my voice being used for Mario\'s Pizza on this platform'), match score (does the consent voice match the sample voice? auto-computed)
BUSINESS CONTEXT: customer details (business type, address, phone), reason for cloning request (free text from customer), customer plan history
RISK INDICATORS (auto-computed): celebrity voice match score, explicit content detection, audio quality score, consent verification status (pass/fail)
ACTION BAR
PRIMARY: 'Approve and provision' button (Indigo) — triggers ElevenLabs voice cloning API, assigns voice ID to customer's agent, sends approval email
SECONDARY: 'Reject' button (Red) — opens modal with rejection reason dropdown (Insufficient audio quality / Suspicious match to public figure / Failed consent verification / Other), free-text explanation
Tertiary: 'Request more info' button — sends customer an email asking for re-submission with specific issue noted
APPROVAL FLOW
Admin clicks 'Approve and provision'
Confirmation modal: 'You are approving voice cloning for [customer]. ElevenLabs will be billed for the voice clone. Continue?'
On confirm: backend calls ElevenLabs API, creates voice ID, assigns to customer's agent
Audit log entry created
Customer receives email: 'Your cloned voice is ready! It is now available in your agent settings.'
Request status moves to 'Approved' tab
REJECTION FLOW
Admin clicks 'Reject', selects reason
Customer receives email with rejection reason and remediation steps
Audit log entry created with admin user, reason, timestamp
BULK OPERATIONS
Select multiple pending requests with checkboxes
Bulk approve (only enabled if all selected requests pass auto-checks)
Bulk reject with same reason
STATE VARIATIONS
Empty queue: 'No pending requests — you're all caught up' with last-reviewed timestamp
High-risk request: red banner at top of detail panel 'This request matched a celebrity voice signature with 87% confidence — manual review required'
ElevenLabs API failure on approve: rollback, error toast, request stays pending with admin note
7.8.8 Build Order for Wireframes
Frontend Agent should build these screens in this order, matching the Build Order in Section 9.9:
Marketing homepage (Phase 6, Day 30) — needed for launch
Onboarding wizard (Phase 4, Days 15-21) — first thing real customers experience
Dashboard home (Phase 3, Day 12) — what customers see after first call
Call log + detail (Phase 3, Day 12) — complete the dashboard core
Agent builder (Phase 3, Day 9) — needed for onboarding to even work
Admin customer detail + impersonation (Phase 5, Day 23) — internal support readiness
Admin voice cloning queue (Phase 5, Day 24) — only matters once Pro customers exist

8. Deployment
This section covers how the platform is deployed, managed, and rolled out across environments. We use Cloudflare for hosting, edge compute, storage, DNS, and security — consolidating most of the infrastructure under one provider. This is cheaper than the Vercel + Railway + S3 alternative (especially on egress), simpler to operate (one dashboard, one billing relationship), and faster (true global edge with sub-50ms latency to most users).
Why Cloudflare
Three reasons drive this choice. (1) Cost: R2 has zero egress fees, which alone saves us thousands per month at scale because audio recording playback is bandwidth-heavy. (2) Latency: Workers run in 300+ locations globally, vs Vercel's ~30 — your dashboard loads fast no matter where the customer is. (3) Simplicity: one provider for hosting, DNS, CDN, WAF, DDoS protection, storage, queues, and DB instead of stitching together 5+ vendors.
8.1 Cloudflare Services Used
Service
Purpose
Pricing
Cloudflare Pages
Static + Next.js frontend hosting at the edge
Free up to 500 builds/month, $20/mo Pro
Cloudflare Workers
Backend API and webhook handlers (serverless edge functions)
Free 100K requests/day, $5/mo for 10M requests
Cloudflare D1
SQLite at the edge — for simple use cases
Free tier: 5GB, 5M reads/day
Neon (Postgres)
Optional — full Postgres if D1 limitations hit
Free tier: 0.5GB, $19/mo Pro
Cloudflare R2
Object storage for audio recordings and voice samples
$0.015/GB/mo, ZERO egress fees
Cloudflare Queues
Async job processing (transcription, billing, emails)
$0.40 per 1M operations
Cloudflare Cron Triggers
Scheduled jobs (daily digest, cleanup, backup)
Free with Workers
Cloudflare KV
Key-value cache for sessions, rate limits, feature flags
Free 100K reads/day, $0.50/M reads
Cloudflare Vectorize
Vector database for knowledge base RAG (menus, FAQs)
Free 5M queries/mo, $0.01/100K queries
Cloudflare Workers AI
Embeddings for knowledge base indexing
Free 10K requests/day
Cloudflare DNS
Custom domain management
Free
Cloudflare WAF + DDoS
Web Application Firewall + DDoS protection
Free tier covers MVP needs
Cloudflare Analytics
Traffic, performance, error metrics
Free
Cloudflare Access
SSO for staff dashboard access
Free for first 50 users
Cloudflare Stream
Optional — if we offer video later
$5 per 1K minutes stored
8.2 Environments
Three environments, each isolated with separate accounts on Vapi, ElevenLabs, Twilio, and Stripe. This prevents test calls from charging production accounts and prevents staging mistakes from touching real customer data.
Environment
Purpose
URL pattern
Hosting
Local
Developer machines for active development
localhost:8787 (wrangler dev)
Wrangler local runtime
Preview
Auto-deploy per pull request for QA
pr-{n}.app.yourdomain.com
Cloudflare Pages preview deployments
Staging
Mirror of production for final QA + integration tests
staging.yourdomain.com
Workers + Pages (staging account)
Production
Live customer traffic
app.yourdomain.com
Workers + Pages (prod account)
Environment isolation is achieved via Wrangler's environment configuration in wrangler.toml — separate D1 databases, R2 buckets, KV namespaces, and secrets per environment.
8.3 Architecture Overview
Frontend (Cloudflare Pages)
Next.js 15 deployed via @cloudflare/next-on-pages adapter
Static pages cached at all 300+ Cloudflare edge locations
SSR pages run on Workers at the nearest edge to the user
Custom domain via Cloudflare DNS (yourdomain.com → Pages)
Free SSL certificate via Cloudflare (auto-renewed)
Backend API (Cloudflare Workers)
Hono framework — TypeScript-native, designed for Workers
All API endpoints run at the edge, single global codebase
Webhook endpoints for Vapi, Stripe, Twilio exposed as Worker routes
Auto-scaling: handles 1 to 10M+ requests per day with no config
Cold start: ~5ms (vs ~500ms for traditional serverless)
Background Jobs (Workers + Queues)
Cloudflare Queues for async work: post-call analysis, billing aggregation, email sending
Cron Triggers for scheduled work: daily digest, weekly summary, recording cleanup
Workflows for multi-step jobs (e.g., voice cloning pipeline with retry logic)
Database
Start with Cloudflare D1 (SQLite at the edge) for V1
Migrate to Neon Postgres if we hit D1 limits (5GB, complex queries, advanced types)
Drizzle ORM works with both — migration path is one config change
D1 has automatic point-in-time recovery for last 30 days
File Storage (Cloudflare R2)
Call recordings stored with 30-day retention (configurable per plan)
Voice samples and consent recordings stored with 7-year retention
Pre-signed URLs for client-side access (10-minute expiry)
Zero egress fees — major cost saving vs S3 ($0.09/GB egress)
CDN, DNS, WAF (all Cloudflare)
All traffic flows through Cloudflare's network by default
DDoS protection automatic and free at any volume
WAF rules pre-configured for OWASP Top 10
Bot management to prevent signup abuse
8.4 CI/CD Pipeline
GitHub Actions handles tests; Cloudflare's Wrangler CLI handles deploys. Every push triggers tests; every merge to main triggers deployment to production via Wrangler.
Developer pushes branch → opens pull request
GitHub Actions runs: lint, type-check (TypeScript), unit tests, integration tests
Cloudflare Pages auto-deploys preview environment for the PR (unique URL)
Reviewer approves PR → merge to main
On merge: GitHub Actions runs production build
Database migrations run via Drizzle (forward-only, never destructive)
Workers deploy via 'wrangler deploy --env production'
Pages deploy automatically on commit to main
Smoke tests run against production URLs
If any smoke test fails → automatic rollback via Wrangler 'rollback' command
Slack notification on success or failure
8.5 Secrets Management
API keys and credentials never live in source code. Cloudflare provides built-in secret management via Wrangler.
Type
Where stored
Examples
Frontend public env vars
Pages environment variables (per environment)
NEXT_PUBLIC_STRIPE_PK, NEXT_PUBLIC_API_URL
Worker secrets
Set via 'wrangler secret put' (encrypted at rest)
VAPI_API_KEY, ELEVENLABS_API_KEY, GROQ_API_KEY, TWILIO_AUTH_TOKEN
Database credentials
Worker bindings (D1) or secrets (Neon)
Auto-injected, never visible to code reviewers
Webhook signing keys
Worker secrets (separate per integration)
VAPI_WEBHOOK_SECRET, STRIPE_WEBHOOK_SECRET
Customer data
D1 (encrypted at rest by Cloudflare)
Voice IDs, call transcripts, billing info
Secrets are rotated on a 90-day schedule. Webhook signing keys are rotated immediately if any team member leaves. Wrangler keeps a local '.dev.vars' file for development that is git-ignored.
8.6 Database Migrations
Drizzle ORM for type-safe schema definitions
Migrations stored in version control under /drizzle
Forward-only — never destructive in a single migration (split renames into add → backfill → remove across deploys)
Migrations run via 'wrangler d1 migrations apply' as part of deploy, before new app version starts
If migration fails: deploy is aborted, old version stays running
Local development uses 'wrangler d1 migrations apply --local' against a local SQLite file
8.7 Monitoring and Observability
Tool
What it monitors
Alert when
Cloudflare Analytics
Request volume, error rates, latency at the edge
5xx error rate >0.5% over 5 minutes
Cloudflare Workers Logs
Streaming logs from all Worker invocations
Specific error patterns trigger alert
Cloudflare Logpush
Push logs to external sink for long-term storage
Audit and compliance retention
Sentry
Application errors with stack traces
New error type appears in production
Cloudflare Health Checks
Synthetic uptime checks every 60s
Any check fails twice in a row
Custom: call success rate
Vapi webhook success vs failure (Worker metric)
Success rate <97%
Custom: cost per call
Computed from usage metrics (D1 query)
Cost per call increases >15% week-over-week
All alerts route to Slack #ops-alerts via Cloudflare Notifications. Critical alerts (production down, payment system failure) also page on-call engineer via PagerDuty.
8.8 Deployment Schedule
Standard deploys
Tuesday and Thursday between 10am and 4pm Pacific (low call volume hours)
Avoid Friday afternoons and weekends (less coverage if something breaks)
Avoid deploys during peak restaurant hours (5pm to 9pm local time)
Hotfixes
Allowed any time for production-down or security issues
Must follow same CI/CD pipeline (no direct pushes to production)
Post-mortem required within 48 hours
8.9 Rollback Strategy
Rollback must be possible within 5 minutes from detection of a problem. Cloudflare Workers makes this straightforward with version-based deploys.
Detection: alert fires from Cloudflare Analytics, Sentry, or custom call-success metric
Decision: on-call engineer assesses — rollback or hotfix-forward?
Rollback Worker: 'wrangler rollback [version-id]' — completes in 5 to 10 seconds globally
Rollback Pages: revert to previous deployment in Cloudflare dashboard (one click)
Database rollback: only if migration was destructive — restore from D1 point-in-time backup
Verify recovery: smoke tests pass, error rates return to baseline
Communicate: status page update, customer-facing notification if downtime exceeded 5 minutes
Post-mortem: document root cause within 48 hours, add prevention to backlog
8.10 Pre-Production Deployment Checklist
Run through this list before launching V1 to real paying customers. Every item must be checked off.
All Worker secrets set via wrangler secret put (production environment)
All Pages environment variables set in Cloudflare dashboard
Stripe production keys configured (not test keys)
Vapi production account funded with credit
ElevenLabs subscription active on Creator tier or above
Twilio account upgraded out of trial mode
Custom domain pointed to Cloudflare with SSL active (Full Strict mode)
D1 database initialized in production with all migrations applied
R2 bucket created with proper CORS configuration for audio playback
Cloudflare WAF rules enabled (OWASP Core Ruleset)
Cloudflare DDoS protection verified active
Sentry receiving errors from production Workers
Cloudflare Health Checks configured for critical endpoints
Status page live at status.yourdomain.com (Cloudflare's status page service)
Webhook signature verification enabled and tested
Rate limiting enabled on all public endpoints (Cloudflare WAF rate limiting rules)
Privacy policy and Terms of Service published and linked from signup
Email deliverability verified (SPF, DKIM, DMARC records on Cloudflare DNS)
Test signup → onboarding → test call flow works end-to-end on production
Test payment → subscription activation → plan upgrade flow
Test cancellation → no further billing
PagerDuty / on-call rotation set up
Customer support email or chat ready (e.g., Intercom or Crisp)
First 5 customer logos lined up for soft launch
8.11 Scaling Plan
Cloudflare Workers scale automatically with no configuration. The bottleneck shifts to upstream APIs (Vapi, ElevenLabs) and database choices, not our hosting.
Trigger
Change
Why
10K calls/day
Upgrade Workers Paid plan ($5/mo → unlimited requests)
Pass free tier limits
25K calls/day
Add R2 lifecycle rules — auto-delete recordings after 30 days
Manage storage costs
50K calls/day
Migrate D1 → Neon Postgres (if D1 query limits hit)
Need full SQL features and larger DB
75K calls/day
Migrate from Vapi to LiveKit Agents (still on Workers)
Save $0.05/min Vapi platform fee
100K calls/day
Switch from ElevenLabs to Cartesia for new clients
Concurrency limits + cost optimization
250K calls/day
Add Cloudflare Argo Smart Routing for upstream API calls
Reduce latency to Vapi/ElevenLabs origin
500K calls/day
Multi-region active-active with Durable Objects for state
Sub-50ms response times globally
8.12 Cost at Scale
Approximate monthly Cloudflare bill at different volumes (excluding upstream APIs like Vapi and ElevenLabs):
Volume
Workers
R2 Storage
Total Cloudflare bill
MVP (1K calls/day)
$0 (free tier)
$0 (free tier)
~$0/mo
Growth (10K calls/day)
$5
$5
~$15/mo
Scale (50K calls/day)
$25
$30
~$70/mo
Production (250K calls/day)
$80
$120
~$250/mo
Compare this to the Vercel + Railway + S3 alternative which would cost roughly $500–800/mo at the 250K calls/day mark — primarily due to S3 egress fees on audio playback.
8.13 Disaster Recovery
Recovery Time Objective (RTO): 1 hour for full restore from total infrastructure failure
Recovery Point Objective (RPO): 1 hour of data loss maximum
Database: D1 has automatic point-in-time recovery for the last 30 days
Code: All deploys versioned by Cloudflare, can roll back via Wrangler in seconds
Audio recordings: R2 has 11 nines durability — no separate backup needed
Customer data export: clients can export their data at any time via dashboard (GDPR readiness)
Quarterly disaster recovery drill: simulate full system failure, restore from backups, document time-to-recovery
Cloudflare itself has 99.99% historical uptime — single-provider risk is acceptable for MVP

9. Development Team (AI-Augmented)
This section is unusual for a PRD because the build team is unusual. There is one human (the founder) plus a multi-agent AI development team running in Claude Code inside VS Code. Each AI agent specializes in a different part of the codebase and they work in parallel. This is how a 6-week MVP becomes possible for a solo founder.
How this works in practice
Claude Code in VS Code supports sub-agents — separate AI workers with their own roles, contexts, and lanes. The founder writes the high-level intent ('build the agent builder screen'), routes the task to the right specialist, and reviews/approves the output. Multiple agents can work in parallel via Claude Code's Task tool. The founder is the architect, product manager, QA, and final approver — the AI does the typing.
9.1 Team Composition
Seven specialized AI agents, one human. Each agent has a defined lane, files they own, and explicit handoff protocols.
Agent
Owns
Primary technologies
Frontend Agent
Customer-facing UI (dashboard, marketing site, onboarding wizard)
Next.js 15, React, Tailwind, Cloudflare Pages
Backend Agent
API endpoints, business logic, webhook handlers
Hono, Cloudflare Workers, TypeScript
Database Agent
Schema, migrations, query optimization
Cloudflare D1, Drizzle ORM, SQL
Voice/Integration Agent
Vapi, ElevenLabs, Twilio, Stripe integrations
Vapi SDK, ElevenLabs API, Twilio API, Stripe API
DevOps Agent
Wrangler config, environments, CI/CD, secrets
Wrangler CLI, GitHub Actions, Cloudflare config
QA/Testing Agent
Unit tests, integration tests, e2e tests
Vitest, Playwright, Wrangler tests
Admin Tool Agent
Internal admin tool at admin.yourdomain.com (separate codebase)
Next.js, Hono, same stack as customer app
Founder (human)
Architecture, product decisions, code review, customer support, sales
Brain
9.2 How Agents Coordinate
Agents are not autonomous. They are specialists called by the founder for specific tasks. Coordination happens through three mechanisms.
Mechanism 1 — Single source of truth
All agents read from the same Git repository
All agents read this PRD, the database schema, and the API contracts
Changes to any of these are committed to the repo, all agents see them on next task
Mechanism 2 — Explicit handoffs
Frontend Agent finishes a screen → notes in Git commit what API endpoints it needs from Backend Agent
Backend Agent reads the request → builds the endpoints → updates the API contract doc
Frontend Agent runs a follow-up task to wire up the new endpoints
Mechanism 3 — Founder as integrator
Founder reviews every PR, approves merges
Founder spots integration issues across agent boundaries early
Founder makes architecture decisions when agents propose conflicting approaches
9.3 Workflow Patterns
Pattern A — Parallel feature build (most common)
Founder describes a feature in a GitHub issue: 'Build the Knowledge Base upload screen'
Founder dispatches three parallel tasks: Frontend (UI), Backend (file upload + RAG indexing), Database (knowledge_base_documents table)
Each agent works in its own branch
After 1-2 hours, all three submit PRs
Founder reviews all three PRs, requests changes if needed, merges in order: DB → Backend → Frontend
QA Agent runs integration tests against the merged feature
Pattern B — Bug fix (sequential)
Founder reports a bug: 'Webhook retries are firing 4 times instead of 3'
Founder dispatches Backend Agent with the bug report and relevant log excerpts
Backend Agent finds the bug, fixes it, writes a regression test
Founder reviews and merges
Pattern C — Cross-cutting refactor (founder-led)
Founder identifies a refactor needed across multiple agent lanes (e.g., 'switch from D1 to Neon Postgres')
Founder writes a migration plan document
Founder dispatches each affected agent with the relevant section
Each agent does their part, founder coordinates the merge order
9.4 What the Founder Actually Does
If the AI agents do the typing, what does the founder actually spend time on? About 50% architecture and review, 30% customer-facing work (sales, support, onboarding), 20% strategy and operations.
Activity
Hours/week
Notes
Code review and PR approval
8–12
Every PR from every agent; this is where you catch issues
Architecture decisions
3–5
When agents propose alternatives or hit ambiguity
Writing prompts for agents
3–5
Crafting clear task descriptions; this skill compounds
Customer support
5–10
First 50 customers, then hire
Sales calls + demos
5–10
Multi-location chains, partnerships
Marketing + content
3–5
Blog, SEO, social
Onboarding new customers
2–4
Concierge for first 5, lighter after
Operations + admin
2–3
Billing, finance, vendor management
Strategic planning
2–3
Roadmap, fundraising, hiring decisions
Total
33–57 hours
Sustainable pace; AI agents amplify your output 3–5x
9.5 Build Velocity Estimate
With this AI-augmented setup, what's realistic for a 6-week MVP?
Approach
MVP timeline
Cost (build only)
Notes
Solo founder (no AI)
12–16 weeks
$0 (sweat)
Slow, error-prone, exhausting
Solo + Claude Code single agent
8–10 weeks
$200/mo
Faster, but agent context-switches a lot
Solo + 7-agent AI team (this plan)
5–7 weeks
$200–500/mo
Each agent specialized, parallel work
Solo + 1 hired engineer
8–10 weeks
$15K (contractor)
Real human helps but coordination overhead
Founder + small dev team (2 engineers)
4–6 weeks
$30K+ (salaries)
Fastest pure speed, but no equity dilution avoided
The 7-agent AI team approach gets you ~80% of the speed of a small dev team at ~2% of the cost. The catch: founder must be capable of architecture and code review. This is not a shortcut for non-technical founders.
9.6 Tooling and Setup
Required setup before any building starts.
VS Code with Claude Code extension installed
GitHub repo for the main app (yourdomain.com codebase)
GitHub repo for the admin tool (admin.yourdomain.com codebase) — separate
Claude Code sub-agent definitions saved in /.claude/agents/ folder per repo
PRD (this document) committed to repo as /docs/PRD.md so all agents can reference it
Database schema committed to /db/schema.ts
API contract committed to /docs/API.md (kept in sync as endpoints change)
Style guide / coding conventions committed to /CONTRIBUTING.md
9.7 Risks of This Approach
Founder bottleneck: every PR needs founder review — at high agent throughput this becomes a queue
Context drift: agents may forget conventions across long projects — mitigated by frequent CONTRIBUTING.md updates
Integration bugs: parallel work creates merge conflicts — mitigated by clear lane boundaries
Quality variance: agents are non-deterministic; same prompt can produce different code
Debt accumulation: rapid feature work can outpace test coverage — QA Agent must be used aggressively
Founder burnout: even with AI, sustaining 40+ hours/week of architecture and review for months is hard
9.8 When to Hire Real Engineers
AI agents are great until they're not. Specific milestones at which hiring a human engineer becomes worth it.
Milestone
Why hire a human
50 customers
Customer support overhead exceeds founder bandwidth — hire support, not engineering, first
100 customers / $10K MRR
Founder can no longer review every PR fast enough — hire 1 senior engineer
250 customers / $30K MRR
Specialized infrastructure work (LiveKit migration, observability) needs deep expertise
500 customers / Series A
Engineering team of 4-6, AI agents become tools used by humans rather than the team
9.9 Build Order (V1 MVP)
Concrete sequence for building the V1 MVP in approximately 6 weeks. The orchestrator should follow this order. Each phase has a clear exit criterion before moving to the next.
Phase 1: Foundation (Days 1-3)
Goal: Repo and infrastructure exist. Hello-world deploys work end-to-end.
Day 1: DevOps Agent — repo structure, wrangler.toml for all 4 environments, GitHub Actions skeleton, Cloudflare account setup checklist for founder
Day 1: Database Agent — full schema from Section 7.2 (all 18 tables) as Drizzle definitions, first migration
Day 2: Backend Agent — Hono app skeleton, health endpoint, error handling middleware, request logging
Day 2: Frontend Agent — Next.js app skeleton, marketing site landing page placeholder, dashboard route shell
Day 3: All agents — first deployment to staging environment, verify all services connected
Exit criterion: Founder can visit staging.yourdomain.com and see a placeholder. Hello-world API call returns 200. Database has all tables. CI passes.
Phase 2: Auth + Billing (Days 4-7)
Goal: A real customer can sign up, pay, and have an account.
Day 4: Backend Agent — Better Auth integration, signup endpoint, session management
Day 4: Frontend Agent — signup page, login page, password reset, OAuth buttons
Day 5: Voice/Integration Agent — Stripe integration, plan selection, checkout flow, webhook handlers
Day 5: Database Agent — billing-related tables (subscriptions, usage tracking), audit logging schema
Day 6: Frontend Agent — pricing page, checkout UI, post-payment redirect
Day 7: QA Agent — end-to-end test for signup → pay → account exists
Exit criterion: Founder can complete signup with a test card, receive Stripe receipt, log in, see empty dashboard.
Phase 3: Voice Agent Core (Days 8-14)
Goal: A configured agent can answer real phone calls.
Day 8: Voice/Integration Agent — Vapi assistant creation API, Twilio number provisioning
Day 9: Frontend Agent — agent builder UI (system prompt, first message, voice picker, capability toggles)
Day 10: Voice/Integration Agent — webhook handlers for Vapi (call started, call ended), call event processing
Day 11: Backend Agent — call records storage, transcript storage, recording R2 upload
Day 11: Voice/Integration Agent — Deepgram + Groq + ElevenLabs configuration through Vapi
Day 12: Frontend Agent — call log view, transcript display, audio playback
Day 13: Voice/Integration Agent — knowledge base upload, Cloudflare Vectorize indexing pipeline
Day 14: QA Agent — end-to-end test: configure agent → place real call → call appears in dashboard
Exit criterion: Founder can configure an agent, get a phone number, place a call to that number, and see the call with transcript and recording in the dashboard within 60 seconds.
Phase 4: Onboarding Wizard (Days 15-21)
Goal: A new customer can self-serve onboard end-to-end.
Day 15: Frontend Agent — onboarding wizard scaffold (7-step flow with progress saving)
Day 16-17: Frontend Agent — Steps 1-3 (business details, phone setup, voice picker)
Day 18: Frontend Agent — Step 4 (knowledge base upload with progress indicator)
Day 19: Frontend Agent — Step 5 (agent customization with template fill-in)
Day 20: Frontend Agent — Step 6 (test call) + Step 7 (forwarding setup wizard with carrier detection)
Day 20: Voice/Integration Agent — forwarding validation auto-detection (Section 4.7)
Day 21: All agents — vertical templates seeded for restaurant, salon, dental, auto, real estate, generic
Exit criterion: Test customer can sign up, complete all 7 onboarding steps in under 30 minutes, place a successful test call.
Phase 5: Admin Tool + Operations (Days 22-28)
Goal: Founder can support customers and run the business.
Day 22: Admin Tool Agent — separate Next.js app at admin.yourdomain.com, Cloudflare Access SSO
Day 23: Admin Tool Agent — customer dashboard, impersonation, edit any account
Day 24: Admin Tool Agent — voice cloning queue, billing tools, promo code management
Day 25: Admin Tool Agent — quality flagged calls review, audit log search
Day 26: Backend Agent — webhook reliability (3 retries with backoff, dead-letter queue)
Day 26: Backend Agent — failed payment handling timeline (Section 5.13.1)
Day 27: Backend Agent — weekly digest email cron job
Day 28: QA Agent — admin tool end-to-end tests, security review of impersonation flow
Exit criterion: Founder can impersonate a customer, fix their config, and see the change reflected. All admin actions logged in audit log.
Phase 6: Demo + Marketing + Polish (Days 29-35)
Goal: The site looks professional and the demo agent works.
Day 29: Voice/Integration Agent — demo agent setup (Mario's Pizza, dedicated Twilio number, Vapi Web SDK browser calls)
Day 30: Frontend Agent — homepage hero with demo CTA, custom-by-name demo input
Day 31: Frontend Agent — marketing site (problem, how-it-works, pricing, FAQ, founder story)
Day 32: Backend Agent — demo rate limiting + Cloudflare Turnstile + abuse prevention
Day 33: All agents — onboarding video (screen recording + voiceover, embedded in wizard)
Day 34: QA Agent — full regression test sweep across all flows
Day 35: All agents — staging soft launch with founder's first test customers
Exit criterion: Acceptance criteria in Section 9.10 fully met. Ready for production launch.
Phase 7: Production Launch (Days 36-42)
Goal: First 5 paying customers live and successful.
Day 36: DevOps Agent — production deployment, all secrets configured, status page live
Day 36: Pre-launch checklist completed (Section 8.10)
Day 37-42: Founder onboards first 5 customers via concierge model, agents fix bugs as they emerge
Exit criterion: 5 paying customers live, each with at least 10 real calls handled successfully, churn at zero, founder ready to open self-serve to wider audience.
9.10 Acceptance Criteria for V1
V1 ships when ALL of the following are demonstrably true. The orchestrator should run through this checklist before declaring V1 complete.
Customer-facing flows
New visitor can call the homepage demo agent (Mario's Pizza) from their phone or browser and have a 90-second conversation
Visitor can enter their business name in the demo input and the agent personalizes the greeting
New customer can sign up with email + password OR Google OAuth, receive verification email
Customer can select a plan and complete Stripe checkout with a real card charge
Customer can complete all 7 onboarding wizard steps in under 30 minutes
Customer can upload a PDF to knowledge base and the agent references it in calls
Customer can place a test call from their cell phone and hear the AI agent answer correctly
After test call, the call appears in dashboard with transcript and recording within 60 seconds
Customer can complete forwarding setup with carrier-specific instructions
Forwarding validation auto-detects whether forwarding worked
Customer can invite a team member, who receives invite email and can log in with their assigned role
Customer can flag a bad call from the dashboard
Customer can cancel their subscription (no proration, runs to end of cycle)
Customer can request account deletion and see the 30-day grace period notice
Internal admin flows
Founder can log into admin.yourdomain.com via Cloudflare Access SSO with MFA
Founder can see list of all customers with MRR rollup
Founder can impersonate any customer, edit their agent prompt, and see audit log entry
Customer receives email notification when admin impersonates their account
Founder can review voice cloning request queue, listen to consent recording, approve or reject
Founder can issue a refund or credit through the admin tool
Founder can create a promo code with limits (max redemptions, expiry)
Founder can review flagged calls with audio + transcript
Founder can search audit logs across all customer accounts
Operational flows
First-call concierge: first 3 calls per new customer auto-flagged for review within 1 hour
Webhook delivery: 3 retries with exponential backoff, dead-letter queue for failures
Failed payment recovery: Day 1 retry + email, Day 3 retry, Day 7 retry + SMS, Day 8 suspend
Weekly digest email sends every Monday morning at 7am customer local time
Quality auto-grading runs on 5% random sample of calls, flagged calls visible to admin
AI safety guardrails are enforced: agent refuses legal/medical/financial advice questions
If owner edits prompt to weaken safety, change queues for admin approval
Status page (status.yourdomain.com) shows component-level health (API, calls, dashboard, integrations)
Technical and infrastructure
All deploys go through CI/CD with lint + tests + smoke tests
Rollback works in under 5 minutes via wrangler rollback
All secrets stored in wrangler secret put, none in code
Database migrations run automatically as part of deploy
Test coverage above 70% for backend, 50% for frontend
Voice agent latency under 800ms time-to-first-response
Dashboard page load under 2 seconds at P95
Webhook delivery under 1 second after call ends
Sentry receives errors from production
UptimeRobot or Cloudflare health checks running on critical endpoints
Documentation
/docs/PRD.md committed (this document)
/docs/API.md fully documents every endpoint
/docs/SCHEMA.md fully documents every table
/docs/INTEGRATIONS.md documents every external API
/docs/DEPLOYMENT.md documents how to deploy and rollback
/docs/DECISIONS.md logs all material decisions made during build
/docs/PROGRESS.md shows V1 checklist with all items checked
9.11 Ambiguity Resolution Protocol
When the PRD is ambiguous or two requirements conflict, follow this protocol. Do not stall the build with constant questions to the founder.
Tier 1 — Decide Yourself (no founder interruption)
If the ambiguity is in any of these areas, make a sensible choice, document it in /docs/DECISIONS.md, and keep building.
Naming things (variable names, function names, file names, route names)
Internal code organization (folder structure, helper modules, abstraction levels)
Test approach (unit vs. integration coverage choices, mock strategy)
Minor UI details (spacing, exact wording, microcopy, button placement)
Error message wording (as long as it is helpful and matches platform tone)
Logging verbosity (default to verbose during build, dial back at launch)
Refactoring choices (improve code as you find issues, no permission needed)
Tier 2 — Document and Continue (founder reviews later)
If the ambiguity might affect the product but is not blocking, make the call, document it clearly with rationale, and tag founder in the next PR description.
Choosing between two reasonable technical implementations
Adding a non-critical feature that seems implied but not specified
Choosing third-party tools when multiple options exist (e.g., a specific email template library)
Performance optimization choices that have tradeoffs
Ordering of items in lists or menus where the PRD does not specify
Tier 3 — Stop and Ask (blocks the build)
Only stop and ask the founder when the answer materially changes the product or business. Use a clear comment in the PR or a GitHub issue tagged @founder. Continue working on other tasks while waiting.
Pricing decisions (any change to plan prices, overage rates, add-on costs)
Customer-facing copy on the marketing site, terms of service, privacy policy
Decisions that conflict with two stated requirements in the PRD
Need for a real-world credential (Vapi key, Stripe key, Cloudflare account)
Architectural decisions you believe are wrong in the PRD and want to challenge
Anything that affects deployed production systems or customer billing
Adding a third-party integration not listed in Section 7.1 (the stack)
How to ask
When asking the founder, structure the question for fast decision:
State the context in 2 sentences
List 2-3 specific options
Recommend one with rationale
Note what you'll do by default if no response in 24 hours
9.12 Progress Tracking
Maintain /docs/PROGRESS.md as a living checklist. Update it after every merged PR. Format:
Phase 1: Foundation [DONE/IN_PROGRESS/NOT_STARTED]
[x] Day 1: Repo structure (DevOps Agent, PR #3)
[x] Day 1: Database schema (Database Agent, PR #5)
[ ] Day 2: Backend skeleton (Backend Agent — in progress)
[ ] Day 2: Frontend skeleton (Frontend Agent — in progress)
Founder reads this once a day to know what's happening without needing to read every PR.

10. Pricing
10.1 Plans
Plan
Price
Included
Best for
Starter
$79/mo
1 location, 200 min, 2 users, basic agent, knowledge base
Solo restaurant or shop
Growth
$149/mo
1 location, 600 min, 4 users, integrations, knowledge base
Established small business
Pro
$299/mo
1 location, 2,000 min, 7 users, voice cloning available, priority support
High-volume venues
Multi-location
$99/mo per location
Unlimited reasonable use per location, all features, 4 users per location, voice cloning, dashboard rollup
Chains and franchises
Multi-location billing notes:
Each location is its own agent, phone number, and call log
Single rolled-up invoice for the parent organization
Discount tier: 10% off at 5+ locations, 15% off at 10+, custom at 25+
All features unlocked at any location count (no separate Pro tier needed)
10.2 Add-Ons
HIPAA / BAA for medical clinics: $99/mo (includes 7-year audit log retention)
Concurrency boost (5 → 15 lines): $49/mo
Extended call recording retention (1 year): $29/mo
Concierge implementation (we set everything up for you): $299 one-time
10.3 Trial and Refund Policy
All sales are final. There is no free trial and no refund window.
Card charged immediately upon plan selection
No refunds except in case of service outages or genuine technical failures (at our discretion)
Customers can cancel anytime, but no proration or partial refund — service continues until end of billing cycle
How customers evaluate before buying: live demo agent on the homepage (see Section 4.0) — visitors call a fully functional AI receptionist for a fictional restaurant before signing up
Why this policy: simplifies billing, eliminates trial abuse, forces clear communication of value before purchase, reduces support burden
10.4 Voice Cloning
Available on Pro and Multi-location plans only
Requested via support email, processed by admin within 24 hours
Included in plan price (no extra cost)
Customer must provide signed consent and 1 to 3 minute audio sample

11. Our Cost Structure
This section is for us, not customers. It breaks down what running this platform actually costs at each stage of growth, where the money goes, and what our gross margins look like. Use this to plan runway, fundraising, and pricing decisions.
11.1 Cost Per Customer Per Month (Average)
Assumptions: average restaurant runs 100 calls/month at 90 seconds each = 150 minutes. Calculations use the Cloudflare-based stack with Vapi + ElevenLabs + Groq + Twilio.
Cost component
Cost per customer/mo
Notes
Vapi orchestration
$7.50
$0.05/min × 150 min
ElevenLabs (TTS)
$2.00
Stock voices on Creator plan, ~7K chars/customer
Twilio telephony
$2.40
$0.0085/min inbound × 150 min + $1.15 number rental
Deepgram STT
$1.20
Bundled in Vapi, but listed for transparency
Groq LLM
$0.05
Free tier or near-free at this volume
Cloudflare hosting
$0.10
Per-customer share of Workers, D1, R2
Stripe fees
$3.00
2.9% + $0.30 of $99 plan
Total cost to serve
$16.25

Revenue (Starter $79)
$79.00

Gross profit per customer
$62.75
79% gross margin
11.2 Monthly Cost at Different Customer Counts
Our total infrastructure + API spend grows roughly linearly with customer count. The fixed costs (Cloudflare base, Stripe minimums, monitoring) are negligible at any scale.
Customers
Variable cost (APIs)
Fixed cost (CF, monitoring)
Total monthly cost
Total revenue (Starter avg)
10
$163
$50
$213
$790
50
$813
$80
$893
$3,950
100
$1,625
$120
$1,745
$7,900
250
$4,063
$200
$4,263
$19,750
500
$8,125
$350
$8,475
$39,500
1,000
$16,250
$600
$16,850
$79,000
These numbers assume Starter plan ($79) average. Reality: customer mix will skew toward Growth ($149) and Pro ($299), which improves both revenue and margin.
11.3 Pre-Revenue Burn Estimate
What we spend in months 1 to 3 before customers arrive.
Item
Monthly cost
Notes
Cloudflare (free tiers cover MVP)
$0
Workers + D1 + R2 free until 1K calls/day
Vapi (pay-as-you-go testing)
$30
Internal dev/test calls
ElevenLabs Creator plan
$22
Required for voice cloning testing
Twilio (free $15 credit covers 2 mo)
$0–10
After credit exhausted
Demo agent on homepage (live in week 4)
$60–360
Scales with traffic — see 10.3.1
Domain name
$1
$12/year amortized
Stripe (no fees until first transaction)
$0

Sentry free tier
$0
Until 5K events/mo
Email (Resend free)
$0
100 emails/day free
Other (analytics, status page)
$10
Misc tools
Total infrastructure burn
~$130–430/mo
Variance is mostly demo traffic
Personal time (owner)
$0 (sweat equity)
Or count opportunity cost
Effective pre-revenue burn
~$390–1,290 over 3 months

Still cheap to start. The total cost to validate the product end-to-end (with the demo running) is under $1,500 over 3 months.
10.3.1 Homepage Demo Cost
The live homepage demo is the primary conversion mechanism (replacing free trial). It costs us money on every interaction, but it converts visitors at much higher rates than a free trial would.
Demo calls/day
Cost per day
Cost per month
Notes
20 (early launch)
$2.40
$72
Mostly your own testing + early visitors
100 (post-launch)
$12
$360
Healthy traffic, treat as marketing spend
500 (after PR)
$60
$1,800
Viral moment — likely worth it for conversion
2,000 (if abused)
$240
$7,200
Rate limits and Turnstile should prevent this
Demo cost calculation: $0.12 per call (3 min × full stack cost). Demo is capped at 3 minutes per call. Treat as customer acquisition cost — each signup that came from the demo absorbs ~$5–20 of demo spend (still excellent CAC).
11.4 Personal Time Cost (Founder Hours)
The hidden cost most founders ignore. If you value your time at $100/hour (a conservative consulting rate), here's where it goes.
Activity
Hours/week
Time cost/week
Notes
Customer support
5–10
$500–1,000
First 50 customers, then hire
Sales calls + demos
5–10
$500–1,000
Qualifying multi-location chains
Product development
10–20
$1,000–2,000
Bug fixes, new features
Marketing + content
3–5
$300–500
Blog, social, SEO
Onboarding new customers
2–4
$200–400
White-glove first month per customer
Operations + admin
2–3
$200–300
Billing, finance, vendor management
Total weekly time
27–52 hours
$2,700–5,200
Equivalent to 1 full-time founder
At ~40 paying customers, you should hire your first support/operations person to free up hours for sales and product.
11.5 Where Costs Will Increase
Costs scale with customer count, but a few line items will jump non-linearly as we grow.
**ElevenLabs concurrency wall**: Standard tier caps at 15 concurrent calls. At ~100 paying customers, we hit this and either upgrade to Enterprise (~$2,000/mo) or migrate to Cartesia (cheaper, more concurrency)
**Vapi platform fee**: $0.05/min adds up. At 50K calls/day (around 1,000 customers), this is $2,250/month just for orchestration. Migrating to LiveKit Agents at scale saves this entirely but requires 2-3 months of engineering
**ElevenLabs voice cloning**: Pro tier required for unlimited cloned voice usage at scale (~$99/mo). Will be needed once 10+ customers are on Pro plan
**Customer support**: First hire at ~40 customers (~$60K/year fully loaded). Second hire at ~150 customers
**Compliance**: SOC 2 Type 1 audit within 12 months ($15-20K one-time). HIPAA audit if serving healthcare ($10-15K)
**Twilio reputation management**: As we scale, may need to invest in dedicated phone number pools and number verification services (~$200-500/mo)
11.6 Path to Profitability
With our pricing model and cost structure, here's roughly when each milestone hits.
Milestone
Customers needed
Monthly revenue
Notes
Cover infrastructure costs
3
$237
Just covers Cloudflare + APIs
Cover all variable costs
5
$395
Including Stripe fees and tools
Cover one part-time contractor
20
$1,580
Marketing or part-time support
Replace founder salary ($120K/yr)
150
$11,850
Sustainable solo business
Hire first full-time employee
200
$15,800
Support or operations lead
Series A-ready metrics
500+
$39,500+
Strong growth + retention
11.7 Customer Acquisition Cost (CAC) Targets
How much we can afford to spend acquiring each customer while staying healthy.
LTV/CAC target ratio: 3:1 minimum, 5:1 ideal
Average customer lifetime (assuming 5% monthly churn): 20 months
Average revenue per customer (blended Starter/Growth/Pro): $130/mo
Average gross profit per customer: $103/mo (79% margin)
LTV (gross profit × lifetime): $2,060
Maximum acceptable CAC: ~$680 (3:1 ratio) — but ideally we keep it under $400
For comparison: typical SMB SaaS CAC ranges from $300-1,200. Our target is at the lower end because we sell to small businesses with shorter decision cycles.
11.8 What Could Break the Math
Honest list of risks that would invalidate these projections.
Customer churn higher than 5%/mo (would shorten lifetime, reduce LTV)
Average call duration significantly longer than 90 seconds (would increase variable costs disproportionately)
Heavy support burden requiring hiring earlier than month 12
Vapi or ElevenLabs raises prices materially
CAC ends up at $1,000+ (would force lower-margin upmarket move)
Customer churn higher than 5%/mo despite no-refund policy (would shorten lifetime, reduce LTV)
Concurrency upgrades hit earlier than projected

12. Roadmap
12.1 V1 — MVP (Weeks 1–6)
Goal: Land 5 paying customers across any of the 5 launch verticals. Validate inbound product end-to-end. Founder personally onboards each.
Auth (Better Auth), Stripe billing (no trial, no refunds), mobile-first dashboard
Public homepage with live demo agent (calling from browser + phone, with custom-by-name option)
Marketing site: hero, problem, how-it-works, pricing, FAQ, founder story, footer
Inbound product end-to-end
Agent builder with 5 vertical templates: restaurant, salon, dental/clinic, auto repair, real estate
Plus a generic 'Other' template for verticals not yet covered
Knowledge base upload (RAG via Cloudflare Vectorize)
Phone number provisioning + forwarding wizard with auto-validation
Call logs, recordings, transcripts
Multi-user accounts with role-based permissions
First-call concierge tracking (first 30 days per new customer, 100% review)
AI safety guardrails (auto-injected, admin-approved changes)
Internal admin tool with full feature set (impersonation, edit any account, audit logs)
Voice cloning admin queue (request, review, approve)
Promo code system (beta + launch + demo conversion codes)
Weekly digest email (designed per vertical)
Onboarding video walkthrough (screen recording + voiceover)
OpenTable + Resy + Google Calendar integrations
SMS / email / Slack notifications to owner
POS receipt format in owner notifications (V1.1 = real Square/Toast integration)
Account deletion flow with 30-day grace period
12.2 V1.1 — Polish + first integrations (Weeks 7–12)
Goal: Reach 25 paying customers. Refine templates based on real usage.
Refined system prompts based on flagged calls from V1 customers
Multi-location dashboard rollup
HIPAA add-on for dental/medical clients
Spanish language support (UI translation + Spanish vertical templates + ElevenLabs Spanish voices)
POS receipt integration: push orders directly to Square and Toast
Improved analytics (weekly digest, outcome trends, quality scores)
Number portability (bring your own number)
Canada market entry
First sales-led customer (multi-location chain)
12.3 V1.2 — POS and CRM integrations (Months 4–5)
Goal: Make the product sticky through deeper integrations.
Square POS integration (orders, customer lookup)
Toast POS integration
HubSpot CRM
Salesforce CRM
Zapier
12.4 V2 — Outbound expansion (Months 6–9)
Goal: Add outbound calling for existing customers as an upsell. Only built once we have 25+ paying inbound customers.
Caller ID verification flow
CSV uploader with DNC scrubbing
Campaign builder and scheduler
TCPA compliance gate and disclosures
Use cases: no-show recovery, appointment reminders, lead callbacks
New plan tier: Inbound + Outbound bundle
12.5 V3 — Scale and verticalize (Months 10–12)
Goal: Drop infrastructure costs at scale, productize verticals.
Migrate from Vapi to LiveKit Agents (drop platform fee)
Switch from ElevenLabs to Cartesia for cost optimization
Native iOS and Android apps
Multi-language support: Arabic, Chinese, Hindi (Spanish was added in V1.1)
White-label / agency tier
Vertical SKUs: Restaurant Pro, Salon Pro, Clinic Pro, Trades Pro

13. Risks and Mitigations
Risk
Impact
Mitigation
Vapi pricing increases or service degrades
High — direct cost to all calls
Build adapter pattern; can swap to Retell or LiveKit in 4 weeks
ElevenLabs concurrency limits hit at scale
Medium — calls fail at peak
Pre-validate Cartesia as backup TTS; auto-failover code
Underlying API outage cascades
High — full platform down
Multi-provider fallbacks for STT/TTS; status page; SLA credits
AI says something wrong on a call
Medium — reputational damage
Owner can flag calls; flagged calls reviewed; system prompts refined weekly
Customer churn higher than expected
High — kills unit economics
Focus on stickiness via integrations; weekly NPS check-ins; live homepage demo filters tire-kickers before signup
Big Tech ships competing product
Medium — pressure on pricing
Win on niche depth, vertical templates, and self-serve onboarding
Voice cloning misuse (deepfakes)
Medium — reputational
Mandatory consent recording, watermarking, abuse detection
Demo abuse (bots calling demo agent burns API credits)
Medium — runs up costs
Cloudflare Turnstile on browser button; rate-limit phone number to 3 calls/day per caller; cap each call at 3 minutes
Slow customer acquisition
High — runway shortens
Focus on one vertical (restaurants) first; partnership with restaurant tech vendors

14. Appendix
14.1 System Prompt — Restaurant Template
Stored as template, populated with business-specific variables at agent creation time.
"You are the AI receptionist for {{business_name}}, a {{cuisine_type}} restaurant located at {{address}}. Hours: {{hours}}. Personality: warm, friendly, efficient. Sound like a real receptionist who has been at the restaurant for years. Capabilities: tell customers our hours and location, take a reservation (collect name, party size, date, time, phone), describe the menu (use knowledge base for details), take a takeout order. If asked is this a real person, say: I am the AI assistant for {{business_name}}, but I can definitely help you. End calls warmly with: Thanks for calling {{business_name}}, we look forward to seeing you."
14.2 System Prompt — Salon and Spa Template
"You are the AI receptionist for {{business_name}}, a {{salon_type}}. Hours: {{hours}}. Capabilities: tell customers our services and pricing ranges (from knowledge base), book appointments (collect name, service requested, preferred stylist, preferred date/time, phone), describe our products. For specific stylist availability, say I will check and have someone confirm via text. Always confirm bookings by reading back the details. Never give skin/hair care medical advice — always say to consult a dermatologist for medical concerns."
14.3 System Prompt — Dental and Medical Clinic Template
"You are the AI receptionist for {{business_name}}, a {{practice_type}} located at {{address}}. Hours: {{hours}}. Capabilities: schedule appointments, answer general practice questions (insurance accepted, services offered, location, parking — all from knowledge base), take messages for the doctors. CRITICAL: Never give medical advice or diagnoses. If a caller describes symptoms, say: For any medical concerns, I will have one of our team call you back. Is this urgent? If yes, instruct them to seek immediate care. Always confirm appointment details by reading them back. Be professional and reassuring."
14.4 System Prompt — Auto Repair Shop Template
"You are the AI receptionist for {{business_name}}, an auto repair shop located at {{address}}. Hours: {{hours}}. Capabilities: schedule service appointments (collect name, vehicle make/model/year, issue description, preferred date/time, phone), give general estimates only when in knowledge base, describe services we offer, take messages. Never quote specific repair prices unless they are in our pricing document. For specific quotes say: We will need to inspect the vehicle to give you an accurate price. Be straightforward and helpful — auto repair customers value honesty."
14.5 System Prompt — Real Estate Agency Template
"You are the AI receptionist for {{business_name}}, a real estate agency at {{address}}. Hours: {{hours}}. Capabilities: route inbound buyer/seller leads to the right agent, schedule property viewings, answer general questions about our agents and listings (from knowledge base), take messages. Always collect: name, phone, email, whether they are buying/selling/renting, and what area or property they are interested in. For specific listing details say: Let me have an agent call you back with full details — what is the best time to reach you?"
14.6 System Prompt — Generic / Other Template
"You are the AI receptionist for {{business_name}}, a {{business_type}} located at {{address}}. Hours: {{hours}}. Capabilities: answer general questions about the business (from knowledge base), take detailed messages with caller name, phone, email, and reason for calling, transfer to a human if specifically requested. When unsure of an answer, take a message rather than guess. Personality: professional, warm, helpful."
14.7 AI Sub-Agent Definitions (Claude Code)
Save these in /.claude/agents/ in the project repo. Each file defines a sub-agent that can be invoked via the Task tool in Claude Code.
14.7.1 Frontend Agent
Filename: /.claude/agents/frontend.md
"You are the Frontend Agent for the AI Receptionist platform. You own all customer-facing UI in /apps/web. Stack: Next.js 15 App Router, React, Tailwind CSS, deployed to Cloudflare Pages. Owned files: /apps/web/app/**, /apps/web/components/**, /apps/web/styles/**. You consume APIs from the Backend Agent — read /docs/API.md for the contract. You consume types from /packages/types. Conventions: server components by default, client components only when needed for interactivity. Mobile-first responsive design. Tailwind utility classes only — no custom CSS unless absolutely necessary. Use shadcn/ui for components. When you need a new API endpoint, do not build it yourself — note the requirement in your PR description and the founder will dispatch the Backend Agent. Test every screen at 375px and 1280px viewport widths before submitting PR."
14.7.2 Backend Agent
Filename: /.claude/agents/backend.md
"You are the Backend Agent for the AI Receptionist platform. You own all API endpoints, business logic, webhook handlers, and integrations in /apps/api. Stack: Hono on Cloudflare Workers, TypeScript. Owned files: /apps/api/src/**. You read database schemas from /packages/db (owned by Database Agent — do not modify). When you add or modify an endpoint, update /docs/API.md in the same PR. Conventions: every endpoint validates input with Zod schemas. Every endpoint has explicit error handling. Webhook endpoints verify signatures before processing. All long-running work goes through Cloudflare Queues, never blocks the response. When you need a schema change, do not modify /packages/db yourself — note the requirement in your PR description. Test happy path + at least one error case for every endpoint before submitting PR."
14.7.3 Database Agent
Filename: /.claude/agents/database.md
"You are the Database Agent for the AI Receptionist platform. You own /packages/db — schema, migrations, query helpers. Stack: Cloudflare D1, Drizzle ORM. Conventions: every schema change is a forward-only migration. Never write destructive migrations in a single step (split renames into add → backfill → remove across deploys). Update /docs/SCHEMA.md whenever you change a table. Provide query helpers for common operations rather than letting the Backend Agent write raw SQL. Validate every migration runs cleanly on a fresh database AND on a database with existing data. Plan migrations to never lock the database during peak hours. Document indexes and explain why each is needed."
14.7.4 Voice/Integration Agent
Filename: /.claude/agents/integrations.md
"You are the Voice and Integrations Agent. You own /apps/api/src/integrations/ — Vapi, ElevenLabs, Twilio, Stripe, Deepgram, Groq, OpenTable, Resy, Google Calendar. Each integration is a separate module with: client setup, typed methods, error handling with retries, logging. Conventions: every external API call has timeout + retry logic. Every webhook from these services has signature verification. Mock all external APIs in tests using msw. Read each integration documentation carefully before implementing — Vapi and Twilio have specific quirks. When an integration changes its API, you are responsible for the migration. Document rate limits and costs for each service in /docs/INTEGRATIONS.md."
14.7.5 DevOps Agent
Filename: /.claude/agents/devops.md
"You are the DevOps Agent. You own /wrangler.toml, /.github/workflows/, secret management, environment configuration, and deployment scripts. Stack: Wrangler CLI, GitHub Actions, Cloudflare dashboard config. Conventions: never commit secrets — use wrangler secret put. Every environment (local, preview, staging, production) has its own complete configuration. CI must run lint, type-check, unit tests, and integration tests on every PR. Deployments must be reversible in under 5 minutes. Every deploy notifies Slack. Document deployment procedures in /docs/DEPLOYMENT.md. Run quarterly disaster recovery drills."
14.7.6 QA/Testing Agent
Filename: /.claude/agents/qa.md
"You are the QA/Testing Agent. You own /tests/ — unit tests, integration tests, end-to-end tests. Stack: Vitest for unit/integration, Playwright for e2e. Conventions: test the contract, not the implementation. Every API endpoint has at least: happy path, validation failure, auth failure, and one edge case. Every UI component has a unit test for rendering and interaction. Critical user flows have e2e tests: signup, onboarding wizard, place test call, view call log. You DO NOT write feature code. When you find a bug while writing tests, file an issue and let the relevant specialist Agent fix it. Maintain test coverage above 70% for backend, 50% for frontend."
14.7.7 Admin Tool Agent
Filename: /.claude/agents/admin.md
"You are the Admin Tool Agent. You own a separate codebase at /apps/admin — the internal tool at admin.yourdomain.com. Stack: same as customer app (Next.js, Hono, D1, R2) but with Cloudflare Access SSO for staff-only access. Owned features: customer impersonation, edit any account, billing tools, voice cloning queue, quality flagged calls review, audit log search, promo code management, system health, customer notes, feature flags. Conventions: every admin action is logged to audit_logs with admin user ID, timestamp, IP, before/after values. Customer is notified by email when admin impersonates or modifies their config. Sessions auto-expire after 1 hour. MFA required for all admin users. UI prioritizes information density over polish — this is an internal tool used by power users."
14.7.8 Coordination Notes (Orchestrator-Led)
These sub-agents are invoked by an orchestrator — typically the main Claude Code session that read this PRD. The orchestrator dispatches tasks to specialists; the specialists do not coordinate directly with each other.
Claude Code in VS Code reads /docs/PRD.md (this document) and acts as the orchestrator
Orchestrator identifies which sub-agent owns the work, dispatches via the Task tool
Multiple sub-agents can run in parallel for independent work
Each sub-agent runs in its own context window — does not see other agents' chat history
Sub-agents communicate ONLY through committed files (Git, /docs/, /packages/types)
After a sub-agent completes work, the orchestrator integrates the output, runs QA Agent, commits
Orchestrator updates /docs/PROGRESS.md after each milestone so founder can see progress
If a sub-agent encounters a Tier 3 ambiguity (Section 9.11), it stops, leaves a clear note, and orchestrator escalates to founder
14.8 Open Questions
How long should call recordings be retained by default — 30 days or 90 days? (Currently 30 days, configurable)
Should we add a self-service vertical template builder for customers in non-standard industries?
How aggressive should the AI quality auto-grading be — random 5% or all calls?
Should we offer service credits (not refunds) for documented outages? E.g., 1 day of service credit per hour of downtime.
Pricing for additional knowledge base storage beyond 25MB — needed?
14.9 Glossary
Term
Definition
Vapi
Voice agent orchestration platform that connects STT, LLM, TTS, and telephony
Vapi Assistant
A configured voice agent with prompts, voice, and behavior — created via Vapi API
LLM
Large Language Model — the AI brain that decides what the agent says
STT
Speech-to-Text — converts caller's voice to text in real time
TTS
Text-to-Speech — converts agent's reply to natural voice audio
Voice cloning
Creating a synthetic voice that matches a real person from an audio sample
Concurrency
Number of simultaneous calls the platform can handle for a single account
Webhook
HTTP POST request sent from one service to another when an event happens
BAA
Business Associate Agreement — required for HIPAA compliance
Forwarding
Process where calls to one phone number are automatically routed to another number
IVR
Interactive Voice Response — the 'press 1 for hours' systems we are replacing
Claude Code
Anthropic's coding agent that runs in VS Code, terminal, and other editors
Sub-agent
A specialized AI worker in Claude Code with its own role and lane (e.g., Frontend Agent)
Wrangler
Cloudflare's CLI for managing Workers, Pages, D1, R2, and other Cloudflare services

