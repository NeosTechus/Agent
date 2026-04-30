// Generic exponential-backoff retry, Web-Crypto / Workers safe.
//
// Default policy: 3 retries with 1s / 2s / 4s base backoff and ±25% jitter.
// Each attempt runs under a per-attempt timeout; total wall time is bounded.
//
// `shouldRetry` lets callers express "only retry on 5xx / 429 / network".
// The default treats thrown errors as retryable and resolved values as final.

import { withTimeout } from "./timeout";

export interface RetryOptions {
  /** Number of retries AFTER the first attempt. Total attempts = retries + 1. */
  retries?: number;
  /** Base delay in ms for first retry. Doubles each attempt. */
  baseDelayMs?: number;
  /** Hard cap on a single attempt. */
  attemptTimeoutMs?: number;
  /** Optional predicate: return false to stop retrying on a specific error. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Inject a clock for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export async function retry<T>(
  fn: (attempt: number, signal: AbortSignal) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 1_000;
  const timeout = opts.attemptTimeoutMs ?? 15_000;
  const shouldRetry = opts.shouldRetry ?? (() => true);
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    try {
      return await withTimeout(fn(attempt, controller.signal), timeout, controller);
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !shouldRetry(err, attempt)) {
        throw err;
      }
      // Exponential backoff with ±25% jitter.
      const expo = base * Math.pow(2, attempt);
      const jitter = expo * (0.75 + Math.random() * 0.5);
      await sleep(jitter);
    }
  }
  // Unreachable — the loop either returns or throws.
  throw lastErr;
}
