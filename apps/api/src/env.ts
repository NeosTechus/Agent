// Cloudflare Workers binding types for the API.
// Mirrors apps/api/wrangler.toml — keep in sync. If a binding is added/removed
// there, update this file in the same PR.

export interface Bindings {
  // ---------------------------------------------------------------------
  // D1 (primary OLTP database)
  // ---------------------------------------------------------------------
  DB: D1Database;

  // ---------------------------------------------------------------------
  // R2 buckets
  // ---------------------------------------------------------------------
  RECORDINGS: R2Bucket;
  KNOWLEDGE_BASE: R2Bucket;
  VOICE_SAMPLES: R2Bucket;
  // ALLOW-LISTED BINDING — voice-cloning consent recordings.
  // 7-year retention per PRD §5.15 + §6.4 (survives account deletion;
  // §5.22 day-30 hard-purge cron MUST NOT touch this bucket).
  // Allow-listed callers ONLY: `services/voices/**` and `admin/voice-clones/**`.
  // DO NOT reference from the deletion cron, billing, or any other path.
  // Adding a caller requires (a) a /docs/DECISIONS.md entry justifying it and
  // (b) updating the allow-list in `eslint.config.mjs`. See the reachability
  // test at `services/account/__tests__/cron-carve-out.test.ts`.
  CONSENT_RECORDINGS: R2Bucket;

  // ---------------------------------------------------------------------
  // KV namespaces
  // ---------------------------------------------------------------------
  SESSIONS: KVNamespace;
  RATE_LIMITS: KVNamespace;
  WEBHOOK_DEDUP: KVNamespace;
  FEATURE_FLAGS: KVNamespace;

  // ---------------------------------------------------------------------
  // Queues (producers — consumers live in apps/api/src/queues/ and are
  // wired in subsequent phases).
  // ---------------------------------------------------------------------
  WEBHOOK_DELIVERY_QUEUE: Queue<unknown>;
  EMAIL_SEND_QUEUE: Queue<unknown>;
  KB_INDEXING_QUEUE: Queue<unknown>;
  CALL_GRADING_QUEUE: Queue<unknown>;
  USAGE_AGGREGATION_QUEUE: Queue<unknown>;
  DIGEST_EMAILS_QUEUE: Queue<unknown>;

  // ---------------------------------------------------------------------
  // Vectorize index — knowledge base embeddings (Phase 3 Day 13).
  // ---------------------------------------------------------------------
  VECTORIZE: VectorizeIndex;

  // ---------------------------------------------------------------------
  // Workers AI — embeddings model. Bound from wrangler.toml `[ai]`.
  // ---------------------------------------------------------------------
  AI: Ai;

  // ---------------------------------------------------------------------
  // Workers Analytics Engine — per-customer usage metrics (call counts,
  // voice minutes, agent publishes, etc.). Optional so dev/test runs that
  // don't bind it stay safe. Bound from `[[env.<env>.analytics_engine_datasets]]`.
  // ---------------------------------------------------------------------
  ANALYTICS?: AnalyticsEngineDataset;

  // ---------------------------------------------------------------------
  // Plain env vars / secrets (typed but unused in Phase 1 skeleton).
  // Wired via `wrangler secret put` and Cloudflare dashboard env vars.
  // ---------------------------------------------------------------------
  ENVIRONMENT?: "development" | "preview" | "staging" | "production";
  GIT_SHA?: string;
  LOG_LEVEL?: "debug" | "info" | "warn" | "error";

  // Auth secrets
  JWT_SIGNING_KEY?: string;
  BETTER_AUTH_SECRET?: string;

  // Third-party secrets (placeholders — populated as integrations land)
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  // Stripe price IDs — one per (plan × billing_period) plus add-ons.
  // Provisioned in Stripe dashboard (test + live), set via `wrangler secret put`.
  STRIPE_PRICE_STARTER_MONTHLY?: string;
  STRIPE_PRICE_STARTER_ANNUAL?: string;
  STRIPE_PRICE_GROWTH_MONTHLY?: string;
  STRIPE_PRICE_GROWTH_ANNUAL?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string;
  STRIPE_PRICE_PRO_ANNUAL?: string;
  STRIPE_PRICE_LOCATION_ADDON?: string;
  STRIPE_PRICE_OVERAGE_METERED?: string;
  // URLs the billing portal / checkout redirects back to.
  BILLING_SUCCESS_URL?: string;
  BILLING_CANCEL_URL?: string;
  BILLING_PORTAL_RETURN_URL?: string;
  VAPI_API_KEY?: string;
  VAPI_WEBHOOK_SECRET?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_WEBHOOK_SECRET?: string;
  // Default outbound Twilio number for SMS (forwarding-validation, overage notifications).
  // E.164 format, e.g. "+15551234567". Provisioned via Twilio dashboard or
  // `phone_numbers/provision`.
  TWILIO_DEFAULT_FROM_NUMBER?: string;
  // Vapi-internal phone-number ID used as the outbound originator for test
  // calls before per-org numbers are persisted. Replaced by
  // `businesses.vapi_phone_number_id` once that column lands (see Day 11).
  VAPI_DEFAULT_PHONE_NUMBER_ID?: string;
  ELEVENLABS_API_KEY?: string;
  // Deepgram + Groq are mostly orchestrated through Vapi at call time; these
  // keys are for batch / fallback paths (Deepgram nova-3 transcription of
  // recorded R2 audio, direct Groq for grading) — see Phase 3 Day 11.
  DEEPGRAM_API_KEY?: string;
  GROQ_API_KEY?: string;
  RESEND_API_KEY?: string;
  /** Verified `from` address for transactional email (e.g. `noreply@yourdomain.com`). */
  RESEND_FROM_EMAIL?: string;
  /** Public origin of the customer web app, used to build links in emails. */
  CUSTOMER_APP_URL?: string;
  SENTRY_DSN?: string;

  // Google OAuth — used by /v1/auth/oauth/google/start + /callback.
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  /** Defaults to `${CUSTOMER_APP_URL}/api/auth/oauth/google/callback`. */
  GOOGLE_OAUTH_REDIRECT_URI?: string;

  // Cloudflare Access — used by /v1/admin/* JWT verification.
  /** e.g. `yourorg.cloudflareaccess.com`. */
  CF_ACCESS_TEAM_DOMAIN?: string;
  /** Optional audience tag from the Access application. When set, the
   *  middleware enforces `aud` claim equality. */
  CF_ACCESS_AUD?: string;

  // Demo agent (homepage) — single shared `VAPI_DEMO_PUBLIC_KEY` plus one
  // assistant id per vertical. `VAPI_DEMO_ASSISTANT_ID` is the legacy
  // alias for the restaurant (Mario's Pizza) demo.
  VAPI_DEMO_PUBLIC_KEY?: string;
  VAPI_DEMO_ASSISTANT_ID?: string; // legacy → restaurant
  VAPI_DEMO_MARIOS_ASSISTANT_ID?: string;
  VAPI_DEMO_SALON_ASSISTANT_ID?: string;
  VAPI_DEMO_DENTAL_ASSISTANT_ID?: string;
  VAPI_DEMO_AUTO_ASSISTANT_ID?: string;
  VAPI_DEMO_REAL_ESTATE_ASSISTANT_ID?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
}
