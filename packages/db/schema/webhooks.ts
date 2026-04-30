import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { timestamps, softDelete } from './_shared';
import { organizations } from './organizations';

export const webhooks = sqliteTable(
  'webhooks',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    url: text('url').notNull(),
    /** JSON-encoded array of subscribed event types */
    eventsSubscribed: text('events_subscribed').notNull(),
    secretToken: text('secret_token').notNull(),
    lastSuccessAt: integer('last_success_at'),
    lastFailureAt: integer('last_failure_at'),
    /** active | paused | disabled */
    status: text('status', { enum: ['active', 'paused', 'disabled'] })
      .notNull()
      .default('active'),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    orgIdx: index('idx_webhooks_organization_id').on(t.organizationId),
    statusIdx: index('idx_webhooks_status').on(t.status),
  }),
);

/** Append-only delivery log. No updated_at, no soft-delete. */
export const webhookDeliveries = sqliteTable(
  'webhook_deliveries',
  {
    id: text('id').primaryKey(),
    webhookId: text('webhook_id')
      .notNull()
      .references(() => webhooks.id),
    eventType: text('event_type').notNull(),
    /** JSON-encoded payload */
    payload: text('payload').notNull(),
    responseCode: integer('response_code'),
    attempts: integer('attempts').notNull().default(0),
    deliveredAt: integer('delivered_at'),
    deadLetterAt: integer('dead_letter_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    webhookIdx: index('idx_webhook_deliveries_webhook_id').on(t.webhookId),
    deadLetterIdx: index('idx_webhook_deliveries_webhook_dead_letter').on(
      t.webhookId,
      t.deadLetterAt,
    ),
  }),
);

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
