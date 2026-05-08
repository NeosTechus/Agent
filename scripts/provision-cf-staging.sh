#!/usr/bin/env bash
#
# provision-cf-staging.sh
# -----------------------
# Idempotently provisions every Cloudflare resource the API Worker needs
# to run in `staging`. On success it prints a copy-pasteable mapping of
# resource IDs that the founder can drop into apps/api/wrangler.toml.
#
# Resources provisioned (all `staging-` prefixed where supported):
#   - 1× D1 database          : app-staging
#   - 4× KV namespaces        : SESSIONS, RATE_LIMITS, WEBHOOK_DEDUP, FEATURE_FLAGS
#   - 4× R2 buckets           : staging-recordings, staging-knowledge-base,
#                                staging-voice-samples, staging-consent-recordings
#   - 6× Queues               : webhook-delivery-staging, email-send-staging,
#                                kb-indexing-staging, call-grading-staging,
#                                usage-aggregation-staging, digest-emails-staging
#   - 1× Vectorize index      : kb-embeddings-staging (768-dim, cosine)
#
# Pre-flight:
#   - `wrangler login` must already have happened (we don't re-authenticate)
#   - run from the repo root (the script chdir's to repo root regardless)
#
# Idempotency:
#   - Each resource is checked via `wrangler <kind> list`. If it already
#     exists we skip creation and re-use the existing ID/name.
#   - Re-running this script is safe; nothing is destroyed.
#
# Output:
#   - A "WRANGLER.TOML MAPPING" block at the end with the IDs to paste in.
#

set -euo pipefail

# ---- Setup -----------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# Pretty output helpers (no emojis — script output goes to logs).
log()    { printf "[provision] %s\n" "$*"; }
warn()   { printf "[provision][warn] %s\n" "$*" >&2; }
err()    { printf "[provision][error] %s\n" "$*" >&2; }
section(){ printf "\n=== %s ===\n" "$*"; }

# Ensure wrangler is on PATH.
if ! command -v wrangler >/dev/null 2>&1; then
  if command -v pnpm >/dev/null 2>&1; then
    WRANGLER="pnpm exec wrangler"
  elif command -v npx >/dev/null 2>&1; then
    WRANGLER="npx wrangler"
  else
    err "wrangler not found and no pnpm/npx available. Install with: npm i -g wrangler"
    exit 1
  fi
else
  WRANGLER="wrangler"
fi

log "Using wrangler: ${WRANGLER}"
log "Repo root:      ${REPO_ROOT}"

# Captured outputs — printed at the end as a mapping the founder pastes
# into apps/api/wrangler.toml.
STAGING_D1_ID=""
STAGING_KV_SESSIONS_ID=""
STAGING_KV_RATE_LIMITS_ID=""
STAGING_KV_WEBHOOK_DEDUP_ID=""
STAGING_KV_FEATURE_FLAGS_ID=""

# ---- D1 --------------------------------------------------------------------

create_d1() {
  local name="$1"
  section "D1: ${name}"

  # `wrangler d1 list` outputs JSON when --json is passed (3.0+).
  local existing
  existing=$(${WRANGLER} d1 list --json 2>/dev/null \
              | grep -E "\"name\":\s*\"${name}\"" -A2 \
              | grep -E "\"uuid\"" \
              | head -n1 \
              | sed -E 's/.*"uuid":\s*"([^"]+)".*/\1/' || true)

  if [[ -n "${existing}" ]]; then
    warn "D1 database '${name}' already exists (id=${existing}); skipping create."
    echo "${existing}"
    return 0
  fi

  log "Creating D1 database '${name}'..."
  local out
  out=$(${WRANGLER} d1 create "${name}" 2>&1)
  echo "${out}"

  # `wrangler d1 create` prints the database_id on a `database_id = "..."` line.
  local id
  id=$(echo "${out}" | grep -E "database_id\s*=" | sed -E 's/.*"([^"]+)".*/\1/' | head -n1)
  if [[ -z "${id}" ]]; then
    err "Could not parse database_id from wrangler output for '${name}'."
    err "Inspect output above and copy the id manually."
  fi
  echo "${id}"
}

STAGING_D1_ID="$(create_d1 app-staging | tail -n1)"

# ---- KV --------------------------------------------------------------------

# `wrangler kv namespace create <BINDING> --env staging` produces a namespace
# whose human-friendly title is "<worker-name>-<env>-<BINDING>" — i.e. for
# our api Worker that's "api-staging-SESSIONS". We use that as the lookup key.
WORKER_BASE="api"  # matches `name = "api"` in apps/api/wrangler.toml

create_kv() {
  local binding="$1"
  local title="${WORKER_BASE}-staging-${binding}"
  section "KV: ${binding}  (title=${title})"

  local existing
  existing=$(${WRANGLER} kv namespace list 2>/dev/null \
              | grep -E "\"title\":\s*\"${title}\"" -B1 \
              | grep -E "\"id\"" \
              | head -n1 \
              | sed -E 's/.*"id":\s*"([^"]+)".*/\1/' || true)

  if [[ -n "${existing}" ]]; then
    warn "KV namespace '${title}' already exists (id=${existing}); skipping create."
    echo "${existing}"
    return 0
  fi

  log "Creating KV namespace '${binding}' (env=staging)..."
  # We pass --config so the worker name is correctly resolved.
  local out
  out=$(${WRANGLER} kv namespace create "${binding}" \
          --env staging \
          --config "${REPO_ROOT}/apps/api/wrangler.toml" 2>&1)
  echo "${out}"

  # Output contains:  id = "abcdef0123..."
  local id
  id=$(echo "${out}" | grep -E "id\s*=" | sed -E 's/.*"([^"]+)".*/\1/' | head -n1)
  if [[ -z "${id}" ]]; then
    err "Could not parse KV namespace id for '${binding}'. Inspect output above."
  fi
  echo "${id}"
}

STAGING_KV_SESSIONS_ID="$(create_kv SESSIONS | tail -n1)"
STAGING_KV_RATE_LIMITS_ID="$(create_kv RATE_LIMITS | tail -n1)"
STAGING_KV_WEBHOOK_DEDUP_ID="$(create_kv WEBHOOK_DEDUP | tail -n1)"
STAGING_KV_FEATURE_FLAGS_ID="$(create_kv FEATURE_FLAGS | tail -n1)"

# ---- R2 --------------------------------------------------------------------

create_r2() {
  local name="$1"
  section "R2 bucket: ${name}"

  if ${WRANGLER} r2 bucket list 2>/dev/null | grep -qE "\"name\":\s*\"${name}\""; then
    warn "R2 bucket '${name}' already exists; skipping create."
    return 0
  fi

  log "Creating R2 bucket '${name}'..."
  ${WRANGLER} r2 bucket create "${name}"
}

create_r2 staging-recordings
create_r2 staging-knowledge-base
create_r2 staging-voice-samples
create_r2 staging-consent-recordings

# ---- Queues ----------------------------------------------------------------

create_queue() {
  local name="$1"
  section "Queue: ${name}"

  if ${WRANGLER} queues list 2>/dev/null | grep -qE "\"queue_name\":\s*\"${name}\""; then
    warn "Queue '${name}' already exists; skipping create."
    return 0
  fi

  log "Creating queue '${name}'..."
  ${WRANGLER} queues create "${name}"
}

create_queue webhook-delivery-staging
create_queue email-send-staging
create_queue kb-indexing-staging
create_queue call-grading-staging
create_queue usage-aggregation-staging
create_queue digest-emails-staging

# ---- Vectorize -------------------------------------------------------------

create_vectorize() {
  local name="$1"
  local dims="$2"
  local metric="$3"
  section "Vectorize: ${name}  (dims=${dims}, metric=${metric})"

  if ${WRANGLER} vectorize list 2>/dev/null | grep -qE "\"name\":\s*\"${name}\""; then
    warn "Vectorize index '${name}' already exists; skipping create."
    return 0
  fi

  log "Creating Vectorize index '${name}'..."
  ${WRANGLER} vectorize create "${name}" --dimensions="${dims}" --metric="${metric}"
}

# 768 dims matches @cf/baai/bge-base-en-v1.5 used in services/knowledge_base/logic.ts.
create_vectorize kb-embeddings-staging 768 cosine

# ---- Final mapping ---------------------------------------------------------

cat <<EOF


==========================================================================
  WRANGLER.TOML MAPPING — paste these IDs into apps/api/wrangler.toml
==========================================================================

# ---- env.preview (staging shares D1 + KV with preview) ----
# line 130:  database_id = "${STAGING_D1_ID}"
# line 150:  id = "${STAGING_KV_SESSIONS_ID}"     # SESSIONS
# line 154:  id = "${STAGING_KV_RATE_LIMITS_ID}"  # RATE_LIMITS
# line 158:  id = "${STAGING_KV_WEBHOOK_DEDUP_ID}"# WEBHOOK_DEDUP
# line 162:  id = "${STAGING_KV_FEATURE_FLAGS_ID}"# FEATURE_FLAGS

# ---- env.staging ----
# line 197:  database_id = "${STAGING_D1_ID}"
# line 217:  id = "${STAGING_KV_SESSIONS_ID}"
# line 221:  id = "${STAGING_KV_RATE_LIMITS_ID}"
# line 225:  id = "${STAGING_KV_WEBHOOK_DEDUP_ID}"
# line 229:  id = "${STAGING_KV_FEATURE_FLAGS_ID}"

# R2 buckets, queues, and the kb-embeddings-staging Vectorize index
# are referenced by NAME in wrangler.toml — no IDs to paste, the names
# already match what this script created.

==========================================================================

Next steps:
  1. Open apps/api/wrangler.toml and replace the REPLACE_WITH_STAGING_*
     placeholders with the IDs above (lines 130, 150, 154, 158, 162,
     197, 217, 221, 225, 229).
  2. Run:  ./scripts/push-secrets-staging.sh
  3. Run:  ./scripts/deploy-staging.sh

Done.
EOF
