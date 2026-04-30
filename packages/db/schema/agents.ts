import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { timestamps, softDelete } from './_shared';
import { businesses } from './businesses';
import { voices } from './voice';
import { users } from './users';

export const agents = sqliteTable(
  'agents',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    name: text('name').notNull(),
    /** inbound | outbound */
    type: text('type', { enum: ['inbound', 'outbound'] }).notNull().default('inbound'),
    systemPrompt: text('system_prompt').notNull(),
    firstMessage: text('first_message').notNull(),
    voiceId: text('voice_id').references(() => voices.id),
    vapiAssistantId: text('vapi_assistant_id'),
    /** draft | active | paused | archived */
    status: text('status', { enum: ['draft', 'active', 'paused', 'archived'] })
      .notNull()
      .default('draft'),
    version: integer('version').notNull().default(1),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    businessIdx: index('idx_agents_business_id').on(t.businessId),
    voiceIdx: index('idx_agents_voice_id').on(t.voiceId),
    vapiIdx: index('idx_agents_vapi_assistant_id').on(t.vapiAssistantId),
  }),
);

export const agentVersions = sqliteTable(
  'agent_versions',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    version: integer('version').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    firstMessage: text('first_message').notNull(),
    voiceId: text('voice_id').references(() => voices.id),
    publishedAt: integer('published_at').notNull(),
    publishedByUserId: text('published_by_user_id')
      .notNull()
      .references(() => users.id),
    /** PRD §5.19 prompt-weakening admin approval queue. */
    reviewState: text('review_state', {
      enum: ['published', 'pending_admin_review', 'rejected'],
    })
      .notNull()
      .default('published'),
    reviewReason: text('review_reason'),
    reviewedByAdminId: text('reviewed_by_admin_id'),
    reviewedAt: integer('reviewed_at'),
    ...timestamps,
  },
  (t) => ({
    agentIdx: index('idx_agent_versions_agent_id').on(t.agentId),
    agentVersionIdx: index('idx_agent_versions_agent_id_version').on(t.agentId, t.version),
    reviewIdx: index('idx_agent_versions_review_state').on(t.reviewState),
  }),
);

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type AgentVersion = typeof agentVersions.$inferSelect;
export type NewAgentVersion = typeof agentVersions.$inferInsert;
