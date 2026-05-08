// Unit tests for the weekly digest cron worker.
// Tests isLocalDigestHour logic (exported via the function's behavior) and
// the generateWeeklyDigest queue-send + dedup logic.

import { describe, expect, it, vi } from "vitest";
import { generateWeeklyDigest } from "../weekly-digest";

// ---------------------------------------------------------------------------
// Helpers to build a minimal Bindings stub
// ---------------------------------------------------------------------------
interface OrgRow { id: string; name: string; timezone: string }
interface CallStats {
  total_calls: number;
  total_duration: number | null;
  flagged_count: number;
  booked_count: number;
}

function makeDb(orgs: OrgRow[], stats: CallStats | null = null) {
  return {
    prepare(sql: string) {
      return {
        bind(..._args: unknown[]) {
          return {
            async first<T>() {
              // call stats query
              if (sql.includes("FROM calls")) {
                return stats as T;
              }
              return null as T;
            },
          };
        },
        async all<T>() {
          // org list query
          if (sql.includes("FROM organizations")) {
            return { results: orgs as unknown as T[] };
          }
          return { results: [] as T[] };
        },
      };
    },
  };
}

function makeKV() {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string, _opts?: unknown) {
      store.set(key, value);
    },
    store,
  };
}

function makeQueue() {
  const sent: unknown[] = [];
  return {
    async send(msg: unknown) { sent.push(msg); },
    sent,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("generateWeeklyDigest — timing gate", () => {
  it("skips orgs whose local time is not Monday 7 AM", async () => {
    // Use a UTC time that is NOT Monday 07:xx for America/New_York
    // 2024-01-16 is a Tuesday. Setting clock to 2024-01-16T12:00:00Z
    const fakeNow = new Date("2024-01-16T12:00:00Z");
    vi.setSystemTime(fakeNow);

    const kv = makeKV();
    const queue = makeQueue();
    const env = {
      DB: makeDb([{ id: "org_01", name: "Cafe", timezone: "America/New_York" }], {
        total_calls: 5, total_duration: 600, flagged_count: 1, booked_count: 2,
      }),
      FEATURE_FLAGS: kv,
      EMAIL_SEND_QUEUE: queue,
      LOG_LEVEL: "silent",
    } as unknown as Parameters<typeof generateWeeklyDigest>[0];

    await generateWeeklyDigest(env);
    expect(queue.sent).toHaveLength(0);

    vi.useRealTimers();
  });

  it("enqueues digest when local time IS Monday 07:xx", async () => {
    // 2024-01-15T12:00:00Z = Monday 07:00 EST (UTC-5)
    const fakeNow = new Date("2024-01-15T12:00:00Z");
    vi.setSystemTime(fakeNow);

    const kv = makeKV();
    const queue = makeQueue();
    const env = {
      DB: makeDb([{ id: "org_01", name: "Cafe", timezone: "America/New_York" }], {
        total_calls: 5, total_duration: 600, flagged_count: 1, booked_count: 2,
      }),
      FEATURE_FLAGS: kv,
      EMAIL_SEND_QUEUE: queue,
      LOG_LEVEL: "silent",
    } as unknown as Parameters<typeof generateWeeklyDigest>[0];

    await generateWeeklyDigest(env);
    expect(queue.sent).toHaveLength(1);
    const msg = queue.sent[0] as Record<string, unknown>;
    expect(msg.kind).toBe("weekly_digest");
    expect(msg.organization_id).toBe("org_01");

    vi.useRealTimers();
  });
});

describe("generateWeeklyDigest — deduplication", () => {
  it("skips an org if the dedup key is already set in KV", async () => {
    const fakeNow = new Date("2024-01-15T12:00:00Z"); // Monday 07:00 EST
    vi.setSystemTime(fakeNow);

    const kv = makeKV();
    // Pre-set the dedup key so this org looks already sent
    await kv.put("digest:org_01:2024-01-15", "sent");

    const queue = makeQueue();
    const env = {
      DB: makeDb([{ id: "org_01", name: "Cafe", timezone: "America/New_York" }], {
        total_calls: 5, total_duration: 600, flagged_count: 0, booked_count: 1,
      }),
      FEATURE_FLAGS: kv,
      EMAIL_SEND_QUEUE: queue,
      LOG_LEVEL: "silent",
    } as unknown as Parameters<typeof generateWeeklyDigest>[0];

    await generateWeeklyDigest(env);
    expect(queue.sent).toHaveLength(0);

    vi.useRealTimers();
  });
});

describe("generateWeeklyDigest — zero-call orgs", () => {
  it("does not enqueue a digest when the org had zero calls this week", async () => {
    const fakeNow = new Date("2024-01-15T12:00:00Z"); // Monday 07:00 EST
    vi.setSystemTime(fakeNow);

    const kv = makeKV();
    const queue = makeQueue();
    const env = {
      DB: makeDb([{ id: "org_01", name: "Cafe", timezone: "America/New_York" }], {
        total_calls: 0, total_duration: null, flagged_count: 0, booked_count: 0,
      }),
      FEATURE_FLAGS: kv,
      EMAIL_SEND_QUEUE: queue,
      LOG_LEVEL: "silent",
    } as unknown as Parameters<typeof generateWeeklyDigest>[0];

    await generateWeeklyDigest(env);
    expect(queue.sent).toHaveLength(0);
    // dedup key written anyway to prevent re-check
    expect(kv.store.has("digest:org_01:2024-01-15")).toBe(true);

    vi.useRealTimers();
  });
});

describe("generateWeeklyDigest — invalid timezone", () => {
  it("gracefully skips orgs with an unrecognised timezone (no throw)", async () => {
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
    const kv = makeKV();
    const queue = makeQueue();
    const env = {
      DB: makeDb([{ id: "org_01", name: "Cafe", timezone: "Not/A/Timezone" }], null),
      FEATURE_FLAGS: kv,
      EMAIL_SEND_QUEUE: queue,
      LOG_LEVEL: "silent",
    } as unknown as Parameters<typeof generateWeeklyDigest>[0];

    await expect(generateWeeklyDigest(env)).resolves.toBeUndefined();
    expect(queue.sent).toHaveLength(0);
    vi.useRealTimers();
  });
});
