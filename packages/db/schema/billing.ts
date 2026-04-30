import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { timestamps } from './_shared';
import { organizations } from './organizations';
import { users } from './users';

export const promoCodes = sqliteTable(
  'promo_codes',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    /** percent | fixed */
    discountType: text('discount_type', { enum: ['percent', 'fixed'] }).notNull(),
    /** Percent points (0-100) or cents depending on discount_type */
    discountValue: integer('discount_value').notNull(),
    maxRedemptions: integer('max_redemptions'),
    redemptionsUsed: integer('redemptions_used').notNull().default(0),
    expiresAt: integer('expires_at'),
    createdByAdminId: text('created_by_admin_id')
      .notNull()
      .references(() => users.id),
    appliesToPlanTier: text('applies_to_plan_tier'),
    ...timestamps,
  },
  (t) => ({
    codeIdx: index('idx_promo_codes_code').on(t.code),
  }),
);

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    /** free | starter | pro | scale | enterprise */
    planTier: text('plan_tier').notNull(),
    /** active | past_due | canceled | incomplete | trialing */
    status: text('status', {
      enum: ['active', 'past_due', 'canceled', 'incomplete', 'trialing'],
    }).notNull(),
    currentPeriodStart: integer('current_period_start'),
    currentPeriodEnd: integer('current_period_end'),
    cancelAtPeriodEnd: integer('cancel_at_period_end', { mode: 'boolean' })
      .notNull()
      .default(false),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index('idx_subscriptions_organization_id').on(t.organizationId),
    statusIdx: index('idx_subscriptions_status').on(t.status),
  }),
);

export const promoRedemptions = sqliteTable(
  'promo_redemptions',
  {
    id: text('id').primaryKey(),
    promoCodeId: text('promo_code_id')
      .notNull()
      .references(() => promoCodes.id),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    redeemedAt: integer('redeemed_at').notNull(),
    appliedToSubscriptionId: text('applied_to_subscription_id').references(
      () => subscriptions.id,
    ),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    promoIdx: index('idx_promo_redemptions_promo_code_id').on(t.promoCodeId),
    orgIdx: index('idx_promo_redemptions_organization_id').on(t.organizationId),
    uniqOrgPromo: uniqueIndex('uniq_promo_redemptions_org_promo').on(
      t.organizationId,
      t.promoCodeId,
    ),
  }),
);

export type PromoCode = typeof promoCodes.$inferSelect;
export type NewPromoCode = typeof promoCodes.$inferInsert;
export type PromoRedemption = typeof promoRedemptions.$inferSelect;
export type NewPromoRedemption = typeof promoRedemptions.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
