import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { organizations } from './organizations';
import { users } from './users';
import { timestamps } from './_shared';

/** Outstanding team invitations. One row per email-per-org. */
export const organizationInvitations = sqliteTable(
  'organization_invitations',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    email: text('email').notNull(),
    role: text('role', { enum: ['owner', 'manager', 'staff', 'viewer'] }).notNull(),
    invitedByUserId: text('invited_by_user_id')
      .notNull()
      .references(() => users.id),
    /** sha256 hex of the opaque token mailed to the invitee. */
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    acceptedAt: integer('accepted_at'),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index('idx_org_invites_org').on(t.organizationId),
    emailIdx: index('idx_org_invites_email').on(t.email),
    tokenIdx: uniqueIndex('idx_org_invites_token').on(t.tokenHash),
  }),
);

export type OrganizationInvitation = typeof organizationInvitations.$inferSelect;
export type NewOrganizationInvitation = typeof organizationInvitations.$inferInsert;
