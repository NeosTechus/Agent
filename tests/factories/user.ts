// User factory — shape mirrors `packages/db/schema/users.ts`.

import { faker } from './seed';

export interface UserFactoryRecord {
  id: string;
  email: string;
  name: string | null;
  stripeCustomerId: string | null;
  planTier: string | null;
  creditsRemaining: number;
  passwordHash: string;
  emailVerifiedAt: number | null;
  emailVerificationToken: string | null;
  emailVerificationExpires: number | null;
  passwordResetToken: string | null;
  passwordResetExpires: number | null;
  createdAt: number;
  updatedAt: number;
}

let counter = 0;

export function createUserFactory(
  overrides: Partial<UserFactoryRecord> = {},
): UserFactoryRecord {
  counter += 1;
  const now = overrides.createdAt ?? Date.now();
  return {
    id: `usr_${counter.toString(16).padStart(8, '0')}${'0'.repeat(24)}`.slice(0, 36),
    email: faker.internet.email().toLowerCase(),
    name: faker.person.fullName(),
    stripeCustomerId: null,
    planTier: null,
    creditsRemaining: 0,
    // Pre-hashed dummy — equivalent to `verifyPassword('Password12345!', hash) === true`
    // would require running the real PBKDF2; instead, tests that need a
    // valid hash should call the real `hashPassword()` from auth/crypto.
    passwordHash: 'pbkdf2$sha256$600000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    emailVerifiedAt: null,
    emailVerificationToken: null,
    emailVerificationExpires: null,
    passwordResetToken: null,
    passwordResetExpires: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
