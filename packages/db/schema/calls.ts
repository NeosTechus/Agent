import { sqliteTable, text, integer, index, real } from 'drizzle-orm/sqlite-core';
import { timestamps, softDelete } from './_shared';
import { businesses } from './businesses';
import { agents } from './agents';

export const calls = sqliteTable(
  'calls',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    agentId: text('agent_id').references(() => agents.id),
    /** inbound | outbound */
    direction: text('direction', { enum: ['inbound', 'outbound'] }).notNull(),
    phoneNumber: text('phone_number'),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    costCents: integer('cost_cents').notNull().default(0),
    transcript: text('transcript'),
    recordingR2Url: text('recording_r2_url'),
    /** booked | info | voicemail | escalated | dropped | other */
    outcome: text('outcome'),
    flagged: integer('flagged', { mode: 'boolean' }).notNull().default(false),
    qualityScore: real('quality_score'),
    isTest: integer('is_test', { mode: 'boolean' }).notNull().default(false),
    /** Denormalized for tenant-scoped queries; matches business.organization_id. */
    organizationId: text('organization_id').notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    businessIdx: index('idx_calls_business_id').on(t.businessId),
    agentIdx: index('idx_calls_agent_id').on(t.agentId),
    orgCreatedIdx: index('idx_calls_org_created').on(t.organizationId, t.createdAt),
    flaggedIdx: index('idx_calls_flagged').on(t.flagged),
  }),
);

export type Call = typeof calls.$inferSelect;
export type NewCall = typeof calls.$inferInsert;
