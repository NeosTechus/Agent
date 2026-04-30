import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { timestamps, softDelete } from './_shared';
import { users } from './users';

export const organizations = sqliteTable(
  'organizations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id),
    planTier: text('plan_tier').notNull().default('free'),
    locationCount: integer('location_count').notNull().default(1),
    stripeCustomerId: text('stripe_customer_id').unique(),
    /** Set when an owner requests deletion. 30-day grace period. */
    deletionRequestedAt: integer('deletion_requested_at'),
    deletionScheduledAt: integer('deletion_scheduled_at'),
    deletionRequestedByUserId: text('deletion_requested_by_user_id'),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    ownerIdx: index('idx_organizations_owner_user_id').on(t.ownerUserId),
    stripeCustomerIdx: uniqueIndex('idx_organizations_stripe_customer_id').on(t.stripeCustomerId),
  }),
);

export const organizationMembers = sqliteTable(
  'organization_members',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    /** owner | manager | staff | viewer */
    role: text('role', { enum: ['owner', 'manager', 'staff', 'viewer'] }).notNull(),
    invitedAt: integer('invited_at').notNull(),
    acceptedAt: integer('accepted_at'),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index('idx_org_members_organization_id').on(t.organizationId),
    userIdx: index('idx_org_members_user_id').on(t.userId),
    uniqMember: uniqueIndex('uniq_org_members_org_user').on(t.organizationId, t.userId),
  }),
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type NewOrganizationMember = typeof organizationMembers.$inferInsert;
