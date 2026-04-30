import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { timestamps } from './_shared';
import { organizations } from './organizations';

/** 30-day concierge tracking window per organization. */
export const firstCallReviewWindow = sqliteTable(
  'first_call_review_window',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    startedAt: integer('started_at').notNull(),
    endsAt: integer('ends_at').notNull(),
    callsReviewedCount: integer('calls_reviewed_count').notNull().default(0),
    escalationsCount: integer('escalations_count').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index('idx_first_call_review_window_organization_id').on(t.organizationId),
  }),
);

export type FirstCallReviewWindow = typeof firstCallReviewWindow.$inferSelect;
export type NewFirstCallReviewWindow = typeof firstCallReviewWindow.$inferInsert;
