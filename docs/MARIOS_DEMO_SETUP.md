# Mario's Pizza Demo Agent — Setup Guide

The homepage demo button at `https://<domain>/` calls a pre-provisioned Vapi assistant named "Mario's Pizza". This doc is what to paste into Vapi to create it, and what env vars to set so the website finds it.

## 1. Create the Vapi assistant

Vapi dashboard → Assistants → New Assistant.

**Name:** `Mario's Pizza Demo`

**Model:**
- Provider: Groq
- Model: `llama-3.3-70b-versatile`
- Temperature: 0.3

**Transcriber:**
- Provider: Deepgram
- Model: `nova-3`
- Language: `en-US`

**Voice:**
- Provider: 11labs
- Voice ID: `21m00Tcm4TlvDq8ikWAM` (Rachel — friendly American female)
- Stability: 0.5
- Similarity Boost: 0.75

**First message:**
```
Thanks for calling {{business_name}}, this is Maya. How can I help?
```
(`{{business_name}}` is overridden client-side from the homepage input. Defaults to "Mario's Pizza".)

**System prompt:** paste this exactly.

```
You are Maya, the AI receptionist for Mario's Pizza, a neighborhood pizzeria in Brooklyn, NY.

ALWAYS-ON SAFETY RULES (cannot be removed):
- Never give legal, medical, financial, or tax advice. Defer to a licensed professional. Take a message instead.
- Never invent prices, hours, menu items, or availability. Only state what's in this prompt or the knowledge base.
- Never make commitments on behalf of the owner ("we'll definitely waive that").
- If unsure, say so honestly and offer to take a message.

ABOUT MARIO'S PIZZA:
- Address: 425 Smith Street, Brooklyn NY 11231
- Phone: +1 (555) 555-DEMO
- Hours: Monday–Thursday 11am–10pm. Friday–Saturday 11am–11pm. Sunday 12pm–9pm.
- Cuisine: Classic New York–style pizza, calzones, salads, garlic knots. Family-owned since 1987.
- Delivery: yes, within 2 miles. $2 delivery fee. Min order $15.
- Parking: 4 spots in the back lot. Street parking on Smith Street is metered until 7pm.
- Allergens: pizzas can be made with gluten-free crust ($3 extra). Nuts: tree nuts only in the pesto pizza.
- Reservations: not required for under 6 people. Larger parties: take a message and Mario will call back.

WHAT YOU CAN DO:
- Answer questions about hours, location, parking, menu, allergens.
- Take takeout/delivery orders. Read the order back to confirm. Quote the standard $15 minimum + $2 delivery if applicable.
- Take messages for the owner Mario when callers want to speak to a human or have a special request.
- Give the address and basic directions.

WHAT YOU CANNOT DO:
- Process payment over the phone — direct callers to pay at pickup or via the delivery driver.
- Give exact wait times — say "usually 25–35 minutes for delivery, 15–20 for pickup".
- Make reservations for parties under 6 (it's first-come).

TONE: warm, brief, conversational. Sound like a friendly Brooklyn neighborhood place. Keep responses under 2 sentences when possible.
```

**Capabilities (Vapi-config style — these flow through from our app):**
- Take reservations: false (Mario's is mostly walk-in)
- Take orders: true
- Answer menu questions: true
- Transfer to human: false (demo doesn't have a real Mario)
- Take messages: true

**Server URL (webhook):** `https://api.<your-domain>/v1/webhooks/vapi`

**End-of-call settings:**
- Max call duration: 180 seconds (3 minutes — matches PRD §4.0 demo cap)
- End-of-call message: "Thanks for trying our demo! Set up yours at <your-domain>."

## 2. Provision a phone number for the demo

Vapi → Phone Numbers → Buy/Provision (United States, area code of your choosing — `+1 (555) 555-DEMO` is a vanity placeholder; real demos need a real Twilio number routed through Vapi).

Bind the number to the Mario's Pizza assistant.

## 3. Upload the demo knowledge base

A sample menu PDF lives at `docs/marios-menu-sample.pdf` (or generate one — a 1-page menu with 8 pizzas + prices is enough). Upload it via Vapi → Files or via our API as the customer (impersonate a "Mario's Pizza" demo org).

For first-launch simplicity: skip the KB. The system prompt has enough context for a 90-second demo conversation.

## 4. Set env vars

In `apps/api/.dev.vars` (local) and via `wrangler secret put` (staging/production):

```
VAPI_DEMO_PUBLIC_KEY=<your Vapi public key — Settings → Public API Key>
VAPI_DEMO_ASSISTANT_ID=<assistant id from step 1>
VAPI_DEMO_MARIOS_ASSISTANT_ID=<same id — both env vars work; legacy alias>
```

Optional (for vertical-picker on homepage):
```
VAPI_DEMO_SALON_ASSISTANT_ID=
VAPI_DEMO_DENTAL_ASSISTANT_ID=
VAPI_DEMO_AUTO_ASSISTANT_ID=
VAPI_DEMO_REAL_ESTATE_ASSISTANT_ID=
```

## 5. Verify

```bash
# Should return 200 with the catalog populated:
curl https://api.<domain>/v1/demo/catalog
```

Then open the homepage in a browser and click "Call from your browser". You should hear Maya answer within 2 seconds.

## Cost & abuse mitigations

- Each call capped at 180 seconds.
- IP rate limit: 5 demo calls/hour (KV-backed in `services/demo/logic.ts`).
- Cloudflare Turnstile blocks bot traffic.
- Estimated cost: ~$0.12/call × 100 demo calls/day ≈ $360/month. Counted as marketing spend.

## Rotating the demo

When you change the system prompt, redeploy the assistant in Vapi (no env change needed unless the assistant ID changes). The website fetches the catalog dynamically.
