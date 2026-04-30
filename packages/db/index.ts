/**
 * @app/db — Drizzle schema, types, and query helpers for the AI Receptionist platform.
 *
 * Runtime note: Cloudflare D1 requires `PRAGMA foreign_keys = ON;` per connection.
 * The API runtime should issue this pragma on startup or when opening a session.
 */
export * from './schema';
export * as queries from './queries';
