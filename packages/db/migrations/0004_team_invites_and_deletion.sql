-- Team invitations: a row per outstanding invite. Resolved on accept (delete row + insert organization_members).
CREATE TABLE organization_invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  invited_by_user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_org_invites_org ON organization_invitations(organization_id);
--> statement-breakpoint
CREATE INDEX idx_org_invites_email ON organization_invitations(email);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_org_invites_token ON organization_invitations(token_hash);
--> statement-breakpoint
-- Account-deletion grace columns on organizations.
ALTER TABLE organizations ADD COLUMN deletion_requested_at INTEGER;
--> statement-breakpoint
ALTER TABLE organizations ADD COLUMN deletion_scheduled_at INTEGER;
--> statement-breakpoint
ALTER TABLE organizations ADD COLUMN deletion_requested_by_user_id TEXT;
