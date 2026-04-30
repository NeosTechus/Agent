// Weekly digest cron job (PRD 5.20).
//
// Cron fires hourly (`0 * * * *`). On each tick we read every org's
// `timezone` column and check whether the org's local time is between
// 07:00 and 07:59 on Monday — if so, emit the digest. A per-org guard in
// the FEATURE_FLAGS KV (`digest:<org_id>:<yyyy-mm-dd>`) prevents double-
// sending if the worker fires twice in the same hour (happens during
// staged rollouts).
//
// V1.1 upgrade from the previous "Monday 12:00 UTC for everyone" model.

import type { Bindings } from "../env";
import { createLogger, type LogLevel } from "../lib/logger";

interface OrgRow {
  id: string;
  name: string;
  timezone: string;
}

interface CallStats {
  total_calls: number;
  total_duration: number | null;
  flagged_count: number;
  booked_count: number;
}

const SEND_HOUR_LOCAL = 7; // 7 AM
const SEND_WEEKDAY = "Mon";

/**
 * Returns true when the given UTC `now` falls inside the 07:00 hour of
 * Monday in `timezone`. Uses `Intl.DateTimeFormat` with the `weekday` +
 * `hour` parts which Workers supports.
 */
function isLocalDigestHour(now: Date, timezone: string): { hit: boolean; localDate: string } {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "numeric",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = fmt.formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const weekday = get("weekday");
    const hour = parseInt(get("hour"), 10);
    const localDate = `${get("year")}-${get("month")}-${get("day")}`;
    return {
      hit: weekday === SEND_WEEKDAY && hour === SEND_HOUR_LOCAL,
      localDate,
    };
  } catch {
    return { hit: false, localDate: "" };
  }
}

export async function generateWeeklyDigest(env: Bindings): Promise<void> {
  const log = createLogger((env.LOG_LEVEL ?? "info") as LogLevel, {
    cron: "weekly-digest",
  });
  const now = new Date();
  const sevenDaysAgo = Math.floor(now.getTime() / 1000) - 7 * 24 * 60 * 60;

  const orgs = await env.DB.prepare(
    `SELECT id, name, timezone FROM organizations WHERE deleted_at IS NULL`,
  ).all<OrgRow>();

  let queued = 0;
  let skipped = 0;
  for (const org of orgs.results ?? []) {
    const { hit, localDate } = isLocalDigestHour(now, org.timezone || "America/New_York");
    if (!hit) {
      skipped++;
      continue;
    }
    // De-dupe: at-most-once per org per Monday.
    const dedupKey = `digest:${org.id}:${localDate}`;
    if (env.FEATURE_FLAGS) {
      const seen = await env.FEATURE_FLAGS.get(dedupKey);
      if (seen) {
        skipped++;
        continue;
      }
    }

    const stats = await env.DB.prepare(
      `SELECT COUNT(*) AS total_calls,
              SUM(duration_seconds) AS total_duration,
              SUM(CASE WHEN flagged = 1 THEN 1 ELSE 0 END) AS flagged_count,
              SUM(CASE WHEN outcome = 'booked' THEN 1 ELSE 0 END) AS booked_count
         FROM calls
        WHERE organization_id = ? AND created_at >= ? AND is_test = 0
              AND deleted_at IS NULL`,
    )
      .bind(org.id, sevenDaysAgo)
      .first<CallStats>();

    if (!stats || stats.total_calls === 0) {
      // Mark as sent anyway so we don't probe again this week.
      if (env.FEATURE_FLAGS) {
        await env.FEATURE_FLAGS.put(dedupKey, "skipped_no_calls", {
          expirationTtl: 8 * 24 * 60 * 60,
        });
      }
      skipped++;
      continue;
    }

    await env.EMAIL_SEND_QUEUE.send({
      kind: "weekly_digest",
      organization_id: org.id,
      stats: {
        total_calls: stats.total_calls,
        total_minutes: Math.round((stats.total_duration ?? 0) / 60),
        flagged_count: stats.flagged_count,
        booked_count: stats.booked_count,
      },
    });
    if (env.FEATURE_FLAGS) {
      await env.FEATURE_FLAGS.put(dedupKey, "sent", {
        expirationTtl: 8 * 24 * 60 * 60,
      });
    }
    queued++;
  }

  log.info("digest.cycle_complete", {
    org_count: (orgs.results ?? []).length,
    queued,
    skipped,
  });
}
