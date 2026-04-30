import { integer } from 'drizzle-orm/sqlite-core';

/**
 * Standard timestamp columns used on every table.
 * Stored as INTEGER unix epoch (milliseconds) per database.md convention #8.
 */
export const timestamps = {
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
};

/** Soft-delete column for customer-data tables. Null when not deleted. */
export const softDelete = {
  deletedAt: integer('deleted_at'),
};
