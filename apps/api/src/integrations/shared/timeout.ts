// Timeout wrapper for promises.
//
// Workers' `fetch` does not accept an AbortController natively in all runtimes
// for outbound HTTP, but we still want a hard upper bound on every external
// call. `withTimeout` races the promise against a setTimeout-driven rejection
// so a hung downstream cannot pin a Worker invocation to its 30-second wall.
//
// If `controller` is provided, the abort is fired on timeout — callers passing
// a `fetch(url, { signal: controller.signal })` get the network teardown for
// free.

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  controller?: AbortController,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller?.abort();
      reject(new TimeoutError(ms));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
