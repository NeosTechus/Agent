import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { timestamps } from './_shared';
import { organizations } from './organizations';
import { subscriptions } from './billing';

/**
 * Per-org per-billing-cycle usage rollup (PRD 5.12).
 *
 * Granularity: ONE row per (organization_id, period_start). Live counters
 * (`minutes_used`, `overage_*`) are incremented as calls finalize; threshold
 * notification timestamps prevent double-sending the 50/80/100/110% emails.
 */
export const usageTracking = sqliteTable(
  'usage_tracking',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    /** Nullable: an org may consume free-tier minutes with no subscription row. */
    subscriptionId: text('subscription_id').references(() => subscriptions.id),
    /** Unix seconds — start of billing cycle (mirrors Stripe period). */
    periodStart: integer('period_start').notNull(),
    /** Unix seconds — end of billing cycle. */
    periodEnd: integer('period_end').notNull(),
    minutesUsed: integer('minutes_used').notNull().default(0),
    /** Snapshot of plan allotment at cycle start; immune to mid-cycle plan changes. */
    minutesIncluded: integer('minutes_included').notNull(),
    overageMinutes: integer('overage_minutes').notNull().default(0),
    overageCents: integer('overage_cents').notNull().default(0),
    notified50pctAt: integer('notified_50pct_at'),
    notified80pctAt: integer('notified_80pct_at'),
    notified100pctAt: integer('notified_100pct_at'),
    notified110pctAt: integer('notified_110pct_at'),
    ...timestamps,
  },
  (t) => ({
    /** Enforces one row per org per cycle. */
    uniqOrgPeriod: uniqueIndex('uniq_usage_tracking_org_period_start').on(
      t.organizationId,
      t.periodStart,
    ),
    /** "Current period" lookups: `WHERE organization_id = ? AND period_end >= now()`. */
    orgPeriodEndIdx: index('idx_usage_tracking_org_period_end').on(
      t.organizationId,
      t.periodEnd,
    ),
  }),
);

export type UsageTracking = typeof usageTracking.$inferSelect;
export type NewUsageTracking = typeof usageTracking.$inferInsert;
