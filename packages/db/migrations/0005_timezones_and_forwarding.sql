-- Per-org timezone (IANA) drives the weekly digest send time + future
-- timezone-aware UI. Defaults to America/New_York for new rows; the
-- onboarding wizard sets it explicitly on first business save.
ALTER TABLE organizations ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/New_York';
--> statement-breakpoint

-- Index on the (timezone, ...) lookup for hourly digest scans.
CREATE INDEX idx_organizations_timezone ON organizations(timezone);
--> statement-breakpoint

-- Forwarding-probe state on businesses. Stores the Vapi call id of the
-- last probe + the most recent observation so the wizard can render a
-- real verified/failed state instead of the V1 heuristic.
ALTER TABLE businesses ADD COLUMN forwarding_probe_call_id TEXT;
--> statement-breakpoint
ALTER TABLE businesses ADD COLUMN forwarding_probe_started_at INTEGER;
--> statement-breakpoint
ALTER TABLE businesses ADD COLUMN forwarding_verified_at INTEGER;
