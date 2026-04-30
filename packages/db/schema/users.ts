import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { timestamps } from './_shared';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name'),
    stripeCustomerId: text('stripe_customer_id').unique(),
    planTier: text('plan_tier'),
    creditsRemaining: integer('credits_remaining').notNull().default(0),
    /**
     * Self-describing hash, e.g. `pbkdf2$sha256$600000$<salt>$<hash>`.
     * NOT NULL with a `DEFAULT ''` so the column is addable on the (currently
     * empty) live table; application code MUST always supply a real hash on
     * insert and treat empty string as "unusable password" (OAuth-only user).
     */
    passwordHash: text('password_hash').notNull().default(''),
    /** Unix epoch ms; null until the user clicks the verification link. */
    emailVerifiedAt: integer('email_verified_at'),
    /** sha256(token) hex per Backend Agent Day-4 decision (token never stored raw). */
    emailVerificationToken: text('email_verification_token'),
    emailVerificationExpires: integer('email_verification_expires'),
    /** sha256(token) hex; 15-minute TTL per PRD 5.1. */
    passwordResetToken: text('password_reset_token'),
    passwordResetExpires: integer('password_reset_expires'),
    ...timestamps,
  },
  (t) => ({
    emailIdx: index('idx_users_email').on(t.email),
    emailVerificationTokenIdx: index('idx_users_email_verification_token').on(
      t.emailVerificationToken,
    ),
    passwordResetTokenIdx: index('idx_users_password_reset_token').on(t.passwordResetToken),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
