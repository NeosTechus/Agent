ALTER TABLE organizations ADD COLUMN stripe_customer_id TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX idx_organizations_stripe_customer_id ON organizations(stripe_customer_id);
