// Organization factory — shape mirrors `packages/db/schema/organizations.ts`.
//
// NOTE: `stripe_customer_id` is on the schema (Day 5 task) — see schema file.

import { faker } from './seed';

export interface OrganizationFactoryRecord {
  id: string;
  name: string;
  ownerUserId: string;
  planTier: string;
  locationCount: number;
  stripeCustomerId: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

let counter = 0;

export function createOrganizationFactory(
  overrides: Partial<OrganizationFactoryRecord> = {},
): OrganizationFactoryRecord {
  counter += 1;
  const now = overrides.createdAt ?? Date.now();
  return {
    id: `org_${counter.toString(16).padStart(8, '0')}${'0'.repeat(24)}`.slice(0, 36),
    name: `${faker.company.name()} ${faker.company.buzzNoun()}`,
    ownerUserId: overrides.ownerUserId ?? `usr_${counter.toString(16).padStart(8, '0')}`,
    planTier: 'free',
    locationCount: 1,
    stripeCustomerId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}
