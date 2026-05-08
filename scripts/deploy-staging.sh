#!/usr/bin/env bash
#
# deploy-staging.sh
# -----------------
# Runs the full staging deploy sequence:
#   1. Apply D1 migrations to app-staging
#   2. Deploy the API Worker  (apps/api → api-staging)
#   3. Deploy the customer web app (apps/web → Cloudflare Pages)
#   4. Deploy the admin tool      (apps/admin → Cloudflare Pages)
#   5. Smoke the /v1/health endpoint
#
# Pre-flight (the script will FAIL if these aren't true):
#   - scripts/provision-cf-staging.sh has been run (resources exist)
#   - apps/api/wrangler.toml has had every REPLACE_WITH_STAGING_* placeholder
#     replaced with a real Cloudflare ID
#   - scripts/push-secrets-staging.sh has been run (secrets present)
#   - You're on the branch you want to deploy, with a clean working tree
#     (this is a soft check — we warn but don't block)
#
# Configuration:
#   STAGING_API_HOST    Hostname for the API health smoke. Defaults to
#                       api-staging.<your-domain> — you almost certainly
#                       want to override this at invocation:
#                         STAGING_API_HOST=api-staging.example.com ./scripts/deploy-staging.sh
#                       Or export it once and forget.
#
#   PAGES_PROJECT_WEB   Cloudflare Pages project name for the web app.
#                       Defaults to "web-staging".
#   PAGES_PROJECT_ADMIN Cloudflare Pages project name for the admin tool.
#                       Defaults to "admin-staging".
#
#   SKIP_PAGES=1        Skip the Pages deploys (deploy only the API + migrate).
#                       Useful if you haven't created the Pages projects yet.
#
#   SKIP_SMOKE=1        Skip the /v1/health smoke (don't bail on missing DNS).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

log()    { printf "[deploy] %s\n" "$*"; }
warn()   { printf "[deploy][warn] %s\n" "$*" >&2; }
err()    { printf "[deploy][error] %s\n" "$*" >&2; }
section(){ printf "\n=== %s ===\n" "$*"; }

# ---- Config ----------------------------------------------------------------

STAGING_API_HOST="${STAGING_API_HOST:-api-staging.example.com}"
PAGES_PROJECT_WEB="${PAGES_PROJECT_WEB:-web-staging}"
PAGES_PROJECT_ADMIN="${PAGES_PROJECT_ADMIN:-admin-staging}"

if [[ "${STAGING_API_HOST}" == "api-staging.example.com" ]]; then
  warn "STAGING_API_HOST is unset — using placeholder 'api-staging.example.com'."
  warn "The /v1/health smoke will fail. Set it in your shell:"
  warn "  export STAGING_API_HOST=api-staging.<your-real-domain>"
fi

# ---- Pre-flight ------------------------------------------------------------

# Reject if any REPLACE_WITH_STAGING_* placeholder is still present in
# apps/api/wrangler.toml — wrangler will accept the deploy but the Worker
# will boot with broken bindings.
section "Pre-flight: wrangler.toml placeholders"
if grep -E "REPLACE_WITH_STAGING_" "${REPO_ROOT}/apps/api/wrangler.toml" >/dev/null 2>&1; then
  err "apps/api/wrangler.toml still contains REPLACE_WITH_STAGING_* placeholders."
  err "Run ./scripts/provision-cf-staging.sh and paste the IDs it prints."
  grep -nE "REPLACE_WITH_STAGING_" "${REPO_ROOT}/apps/api/wrangler.toml" || true
  exit 1
fi
log "OK — no REPLACE_WITH_STAGING_* placeholders in apps/api/wrangler.toml."

# Soft check: clean working tree.
if command -v git >/dev/null 2>&1 && [[ -d "${REPO_ROOT}/.git" ]]; then
  if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain 2>/dev/null)" ]]; then
    warn "Working tree is dirty — you're about to deploy uncommitted changes."
  fi
fi

# ---- 1. Migrations ---------------------------------------------------------

section "1/5 — D1 migrations (app-staging)"
log "Running: pnpm db:migrate:staging"
pnpm db:migrate:staging

# ---- 2. API Worker ---------------------------------------------------------

section "2/5 — Deploy API Worker (apps/api → api-staging)"
log "Running: pnpm deploy:staging"
pnpm deploy:staging

# ---- 3. Customer web (Cloudflare Pages) ------------------------------------

if [[ "${SKIP_PAGES:-0}" == "1" ]]; then
  warn "SKIP_PAGES=1 — skipping Cloudflare Pages deploys."
else
  section "3/5 — Deploy customer web (apps/web → Pages: ${PAGES_PROJECT_WEB})"

  # Build apps/web with the staging API host baked in.
  log "Building apps/web (NEXT_PUBLIC_API_URL=https://${STAGING_API_HOST})"
  (
    cd "${REPO_ROOT}/apps/web"
    NEXT_PUBLIC_API_URL="https://${STAGING_API_HOST}" \
      pnpm build
  )

  # Deploy build output to Pages.
  log "Deploying apps/web/.next to Pages project '${PAGES_PROJECT_WEB}'"
  (
    cd "${REPO_ROOT}/apps/web"
    wrangler pages deploy .next \
      --project-name "${PAGES_PROJECT_WEB}" \
      --branch staging
  )

  section "4/5 — Deploy admin tool (apps/admin → Pages: ${PAGES_PROJECT_ADMIN})"

  log "Building apps/admin (NEXT_PUBLIC_API_URL=https://${STAGING_API_HOST})"
  (
    cd "${REPO_ROOT}/apps/admin"
    NEXT_PUBLIC_API_URL="https://${STAGING_API_HOST}" \
      pnpm build
  )

  log "Deploying apps/admin/.next to Pages project '${PAGES_PROJECT_ADMIN}'"
  (
    cd "${REPO_ROOT}/apps/admin"
    wrangler pages deploy .next \
      --project-name "${PAGES_PROJECT_ADMIN}" \
      --branch staging
  )
fi

# ---- 5. Smoke /v1/health ---------------------------------------------------

if [[ "${SKIP_SMOKE:-0}" == "1" ]]; then
  warn "SKIP_SMOKE=1 — skipping /v1/health smoke."
else
  section "5/5 — Smoke https://${STAGING_API_HOST}/v1/health"

  HEALTH_URL="https://${STAGING_API_HOST}/v1/health"
  log "GET ${HEALTH_URL}"

  # Capture both status and body. Bail with full body on non-200.
  set +e
  HTTP_BODY=$(mktemp)
  HTTP_STATUS=$(curl -sS -o "${HTTP_BODY}" -w "%{http_code}" --max-time 10 "${HEALTH_URL}")
  CURL_RC=$?
  set -e

  if [[ "${CURL_RC}" -ne 0 ]]; then
    err "curl failed (rc=${CURL_RC}). Is DNS pointing at the Worker? Is STAGING_API_HOST correct?"
    err "  STAGING_API_HOST=${STAGING_API_HOST}"
    rm -f "${HTTP_BODY}"
    exit 1
  fi

  if [[ "${HTTP_STATUS}" != "200" ]]; then
    err "Health smoke FAILED — HTTP ${HTTP_STATUS} from ${HEALTH_URL}"
    err "Body:"
    cat "${HTTP_BODY}" >&2 || true
    rm -f "${HTTP_BODY}"
    exit 1
  fi

  log "Health 200 OK. Response:"
  cat "${HTTP_BODY}"
  echo
  rm -f "${HTTP_BODY}"
fi

cat <<EOF


==========================================================================
  Staging deploy complete.
==========================================================================
  API:   https://${STAGING_API_HOST}/v1/health
  Web:   https://${PAGES_PROJECT_WEB}.pages.dev   (or your custom domain)
  Admin: https://${PAGES_PROJECT_ADMIN}.pages.dev (Cloudflare Access protected)

Next steps:
  - Send a Stripe test webhook from the dashboard and confirm 200 in logs.
  - Run an integration test against staging:
      VITE_API_URL=https://${STAGING_API_HOST} pnpm test:integration
  - Tail logs: wrangler tail --env staging --config apps/api/wrangler.toml
EOF
