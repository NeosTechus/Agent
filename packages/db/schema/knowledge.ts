import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { timestamps, softDelete } from './_shared';
import { businesses } from './businesses';

export const knowledgeBaseDocuments = sqliteTable(
  'knowledge_base_documents',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    fileName: text('file_name').notNull(),
    fileType: text('file_type').notNull(),
    r2Url: text('r2_url').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    indexedAt: integer('indexed_at'),
    vectorNamespace: text('vector_namespace'),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    businessIdx: index('idx_kb_docs_business_id').on(t.businessId),
  }),
);

export type KnowledgeBaseDocument = typeof knowledgeBaseDocuments.$inferSelect;
export type NewKnowledgeBaseDocument = typeof knowledgeBaseDocuments.$inferInsert;
