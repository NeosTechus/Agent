// Deterministic faker seed helper.
//
// CI MUST never produce different values between runs; we seed faker the
// same way for every test file. The seed integer is arbitrary — pick once,
// don't change without reviewing snapshots.

import { faker } from '@faker-js/faker';

export const FAKER_SEED = 0xdecaf;

export function resetFakerSeed(seed: number = FAKER_SEED): void {
  faker.seed(seed);
}

// Initialize once at module load so factories that import the singleton
// faker before a test calls `resetFakerSeed` still get deterministic values.
resetFakerSeed();

export { faker };
