#!/usr/bin/env bash
#
# push-secrets-staging.sh
# -----------------------
# Reads apps/api/.dev.vars (or apps/api/.staging.vars if present, which
# overrides individual keys for staging) and pushes each secret to the
# staging Cloudflare Worker via `wrangler secret put NAME --env staging`.
#
# Variables that are NOT secrets (LOG_LEVEL, ENVIRONMENT, BILLING_*_URL,
# CUSTOMER_APP_URL, RESEND_FROM_EMAIL, CF_ACCESS_TEAM_DOMAIN) are skipped —
# those belong in the [vars] block of apps/api/wrangler.toml, not as secrets.
#
# Override priority (most-specific wins):
#   apps/api/.staging.vars  (if present)  — staging-only overrides
#   apps/api/.dev.vars                    — base values
#
# Values are piped via stdin, never via argv, so they don't end up in
# shell history or process listings.
#
# Idempotency:
#   - `wrangler secret put` already overwrites silently if the secret
#     already exists; re-running this script is safe.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

API_DIR="${REPO_ROOT}/apps/api"
DEV_VARS="${API_DIR}/.dev.vars"
STAGING_VARS="${API_DIR}/.staging.vars"

log()  { printf "[secrets] %s\n" "$*"; }
warn() { printf "[secrets][warn] %s\n" "$*" >&2; }
err()  { printf "[secrets][error] %s\n" "$*" >&2; }

if [[ ! -f "${DEV_VARS}" ]]; then
  err "Could not find ${DEV_VARS}. Copy apps/api/.dev.vars.example to apps/api/.dev.vars and fill it in."
  exit 1
fi

if [[ -f "${STAGING_VARS}" ]]; then
  log "Found ${STAGING_VARS} — its values will override .dev.vars for staging."
else
  warn "No ${STAGING_VARS} file found. Falling back to .dev.vars verbatim."
  warn "BILLING_*_URL and CUSTOMER_APP_URL will point at localhost — you almost certainly want a .staging.vars."
  warn "See apps/api/.staging.vars.example for the template."
fi

if ! command -v wrangler >/dev/null 2>&1; then
  if command -v pnpm >/dev/null 2>&1; then
    WRANGLER="pnpm exec wrangler"
  elif command -v npx >/dev/null 2>&1; then
    WRANGLER="npx wrangler"
  else
    err "wrangler not found and no pnpm/npx available."
    exit 1
  fi
else
  WRANGLER="wrangler"
fi

# These vars live in [vars] of wrangler.toml or are computed at runtime —
# they must NOT be pushed as secrets.
SKIP_KEYS=(
  LOG_LEVEL
  ENVIRONMENT
  BILLING_SUCCESS_URL
  BILLING_CANCEL_URL
  BILLING_PORTAL_RETURN_URL
  CUSTOMER_APP_URL
  RESEND_FROM_EMAIL
  CF_ACCESS_TEAM_DOMAIN
)

is_skipped() {
  local key="$1"
  local s
  for s in "${SKIP_KEYS[@]}"; do
    [[ "${s}" == "${key}" ]] && return 0
  done
  return 1
}

# Read a file into an associative array of key=value pairs.
# - Strips surrounding whitespace
# - Skips blank lines and comments (#)
# - Strips inline trailing comments only when the value isn't quoted
declare -A VARS

load_vars_file() {
  local file="$1"
  [[ -f "${file}" ]] || return 0
  while IFS= read -r line || [[ -n "${line}" ]]; do
    # Strip leading/trailing whitespace.
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"

    # Skip empty + comment lines.
    [[ -z "${line}" || "${line:0:1}" == "#" ]] && continue

    # Must be KEY=VALUE.
    [[ "${line}" != *"="* ]] && continue

    local key="${line%%=*}"
    local value="${line#*=}"

    # Trim whitespace around key.
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"

    # Trim leading whitespace on value (don't trim trailing — value may
    # legitimately be empty or contain trailing chars we should preserve).
    value="${value#"${value%%[![:space:]]*}"}"

    # Strip surrounding quotes if present.
    if [[ "${value}" == \"*\" || "${value}" == \'*\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    VARS["${key}"]="${value}"
  done < "${file}"
}

# Base values from .dev.vars, then staging overrides.
load_vars_file "${DEV_VARS}"
load_vars_file "${STAGING_VARS}"

# Push each secret.
PUSHED=0
SKIPPED=0
EMPTY=0
FAILED=0

# Sort keys for stable output.
SORTED_KEYS=$(printf "%s\n" "${!VARS[@]}" | sort)

while IFS= read -r key; do
  [[ -z "${key}" ]] && continue
  value="${VARS[${key}]}"

  if is_skipped "${key}"; then
    log "skip (non-secret):    ${key}"
    SKIPPED=$((SKIPPED+1))
    continue
  fi

  if [[ -z "${value}" ]]; then
    warn "skip (empty value):   ${key}"
    EMPTY=$((EMPTY+1))
    continue
  fi

  log "push:                 ${key}"
  if printf '%s' "${value}" | ${WRANGLER} secret put "${key}" \
        --env staging \
        --config "${API_DIR}/wrangler.toml" >/dev/null 2>&1; then
    PUSHED=$((PUSHED+1))
  else
    err "FAILED:               ${key}"
    FAILED=$((FAILED+1))
  fi
done <<< "${SORTED_KEYS}"

echo
log "Done. pushed=${PUSHED}, skipped(non-secret)=${SKIPPED}, skipped(empty)=${EMPTY}, failed=${FAILED}"
log "Verify with:  wrangler secret list --env staging --config apps/api/wrangler.toml"

if [[ "${FAILED}" -gt 0 ]]; then
  exit 1
fi
