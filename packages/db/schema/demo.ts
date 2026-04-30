import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/** Append-only homepage demo call log. No org_id (pre-signup), no soft-delete. */
export const demoCalls = sqliteTable(
  'demo_calls',
  {
    id: text('id').primaryKey(),
    callerId: text('caller_id'),
    ipAddress: text('ip_address'),
    businessNameEntered: text('business_name_entered'),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    transcript: text('transcript'),
    endedNaturally: integer('ended_naturally', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    ipIdx: index('idx_demo_calls_ip_address').on(t.ipAddress),
    createdIdx: index('idx_demo_calls_created_at').on(t.createdAt),
  }),
);

export type DemoCall = typeof demoCalls.$inferSelect;
export type NewDemoCall = typeof demoCalls.$inferInsert;
