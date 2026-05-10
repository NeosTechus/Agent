# Cloudflare Logpush Setup — Worker Trace Events (staging)

Ships request logs from the `api-staging` Worker to R2 with 30-day retention,
extending the default 7-day retention provided by Workers Observability.

## Resources

| Resource | Value |
| --- | --- |
| Cloudflare account ID | `892c6204edd7bb3fd7599b5bb567ce90` |
| R2 bucket | `staging-worker-logs` (created `2026-05-10T04:24:54Z`) |
| Logpush job name | `api-staging-logs` |
| Logpush job ID | _pending — see "Outstanding step" below_ |
| Dataset | `workers_trace_events` |
| Filter | `ScriptName = api-staging` |
| Destination | `r2://staging-worker-logs/{DATE}?account-id=892c6204edd7bb3fd7599b5bb567ce90` |
| Plan requirement | Workers Paid (in effect) |

The R2 bucket name `staging-worker-logs` is intentionally distinct from the
four existing staging buckets (`staging-recordings`, `staging-knowledge-base`,
`staging-voice-samples`, `staging-consent-recordings`) and not bound to the
Worker — Logpush writes to it directly via the Cloudflare control plane.

## Outstanding step — Logpush job creation

The R2 bucket exists, but the Logpush job itself was not created yet because
the local `wrangler` OAuth session does not include `Logs Edit` permission
(scopes stored at `~/Library/Preferences/.wrangler/config/default.toml` cover
workers/r2/d1/queues/etc., not logs). The Cloudflare API rejected the OAuth
token with `code 10000 Authentication error`.

Wrangler 3 and 4 do not expose a `logpush` subcommand — Logpush is an
account-level API resource, not a Worker-scoped one.

To finish the setup, do **one** of the following:

### Option 1 — Create an API token (preferred)

1. Go to https://dash.cloudflare.com/profile/api-tokens → **Create Token** →
   **Custom token** with these permissions:
   - Account → Logs → Edit
   - Account → Account Settings → Read
   - Account → Workers R2 Storage → Edit (lets the job write to R2)
   Restrict to account `892c6204edd7bb3fd7599b5bb567ce90`.
2. Run:
   ```bash
   export CLOUDFLARE_API_TOKEN="<paste-token>"
   curl -s -X POST \
     "https://api.cloudflare.com/client/v4/accounts/892c6204edd7bb3fd7599b5bb567ce90/logpush/jobs" \
     -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
     -H "Content-Type: application/json" \
     --data '{
       "destination_conf": "r2://staging-worker-logs/{DATE}?account-id=892c6204edd7bb3fd7599b5bb567ce90",
       "dataset": "workers_trace_events",
       "filter": "{\"where\":{\"and\":[{\"key\":\"ScriptName\",\"operator\":\"eq\",\"value\":\"api-staging\"}]}}",
       "enabled": true,
       "name": "api-staging-logs"
     }'
   ```
3. Capture the `result.id` from the response and update the table above.

### Option 2 — Cloudflare dashboard

Analytics & Logs → Logpush → Add Logpush job:
- Dataset: **Workers trace events**
- Destination: **R2** → bucket `staging-worker-logs` → path `{DATE}`
- Filter: `ScriptName equals api-staging`
- Job name: `api-staging-logs`
- Enabled: yes

## Verify the job exists

```bash
curl -s -X GET \
  "https://api.cloudflare.com/client/v4/accounts/892c6204edd7bb3fd7599b5bb567ce90/logpush/jobs" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" | jq '.result[] | {id, name, dataset, enabled, destination_conf}'
```

Expect to see `name: "api-staging-logs"`, `enabled: true`, dataset
`workers_trace_events`. First objects land in R2 within ~5 minutes.

## 30-day retention — manual R2 lifecycle rule (still TODO)

Logpush itself does not expire R2 objects. Configure a lifecycle rule:

1. Cloudflare dashboard → R2 → `staging-worker-logs` → **Settings** → **Object
   lifecycle rules** → Add rule:
   - Apply to: all objects in bucket
   - Action: **Delete objects** after **30 days**
2. Or via API (`PUT /accounts/{account}/r2/buckets/staging-worker-logs/lifecycle`)
   with a JSON rule that sets `conditions.age = 2592000` seconds and
   `action = { type: "Delete" }`.

Confirm the rule is in place before relying on auto-expiry — until then, logs
accumulate indefinitely.

## Querying the logs

Logpush writes newline-delimited JSON to
`r2://staging-worker-logs/<YYYY-MM-DD>/<batch>.log.gz`. Example queries:

```bash
# List today's batches
npx wrangler r2 object get staging-worker-logs --prefix "$(date -u +%Y-%m-%d)/"

# Pull a batch and inspect
aws s3 cp s3://staging-worker-logs/2026-05-10/<batch>.log.gz ./logs.gz \
  --endpoint-url https://892c6204edd7bb3fd7599b5bb567ce90.r2.cloudflarestorage.com
gunzip -c logs.gz | jq 'select(.Outcome != "ok") | {EventTimestampMs, Outcome, Exceptions, Logs}'
```

Field reference: https://developers.cloudflare.com/logs/reference/log-fields/account/workers_trace_events/

## Production note

Production (`api-prod` script name) is intentionally **not** covered by this
job. When prod is ready, create a sibling job `api-prod-logs` writing to a
separate `prod-worker-logs` bucket with its own retention policy.

## References

- Logpush API: https://developers.cloudflare.com/logs/logpush/logpush-job/api-configuration/
- R2 destinations: https://developers.cloudflare.com/logs/get-started/enable-destinations/r2/
- Workers trace events fields: https://developers.cloudflare.com/logs/reference/log-fields/account/workers_trace_events/
