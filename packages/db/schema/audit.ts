import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { organizations } from './organizations';
import { users } from './users';

/** Append-only audit log. No updated_at, no soft-delete. */
export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: text('user_id').references(() => users.id),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    /** JSON-encoded snapshot before mutation */
    beforeValue: text('before_value'),
    /** JSON-encoded snapshot after mutation */
    afterValue: text('after_value'),
    ipAddress: text('ip_address'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    orgCreatedIdx: index('idx_audit_logs_org_created').on(t.organizationId, t.createdAt),
    userIdx: index('idx_audit_logs_user_id').on(t.userId),
    resourceIdx: index('idx_audit_logs_resource').on(t.resourceType, t.resourceId),
  }),
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
