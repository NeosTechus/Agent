// API entry point. Composes middleware + route modules into the Hono app
// exported as the Worker default.
//
// Middleware order (per backend.md "Middleware order"):
//   1. CORS
//   2. Request ID
//   3. Logger
//   4. Rate limiter
//   5. Idempotency (webhook routes only — wired per-route in later phases)
//   6. Auth / authorization (Phase 2+)
//   7. Handler
//   8. Error handler (registered via app.onError)

import { Hono } from "hono";

import { cors } from "./middleware/cors";
import { errorHandler } from "./middleware/error-handler";
import { requestId } from "./middleware/request-id";
import { requestLogger } from "./middleware/logger";
import { rateLimit } from "./middleware/rate-limit";
import { globalAuthMiddleware } from "./middleware/auth";
import { routes } from "./routes";
import type { AppEnv } from "./types";
import type { Bindings } from "./env";
import { createLogger, type LogLevel } from "./lib/logger";
import {
  handleRecordingUpload,
  type RecordingUploadMessage,
} from "./queues/recording-upload";
import { runIndexing, type KbIndexMessage } from "./services/knowledge_base/logic";
import {
  handleWebhookDelivery,
  type WebhookDeliveryMessage,
} from "./queues/webhook-delivery";
import { handleDunning, type DunningMessage } from "./queues/dunning";
import { generateWeeklyDigest } from "./queues/weekly-digest";
import {
  runQualityGrade,
  type QualityGradeMessage,
} from "./queues/quality-grading";
import { runScheduledDeletions } from "./services/account/logic";
import { handleEmailSend, type EmailMessage } from "./queues/email-send";
import {
  handleUsageAggregation,
  type UsageAggregationMessage,
} from "./queues/usage-aggregation";

const app = new Hono<AppEnv>();

// Global middleware stack.
app.use("*", cors());
app.use("*", requestId());
app.use("*", requestLogger());
app.use("*", rateLimit());
// Auth runs after the logging/rate-limit stack so unauth attempts are
// still observable + rate-limited. Public routes (health, /v1/auth/*,
// webhooks) are skipped inside the middleware.
app.use("*", globalAuthMiddleware());

// Mounted route modules.
app.route("/", routes);

// 404 fallback — keep response shape consistent with the error envelope.
app.notFound((c) => {
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
        request_id: c.get("request_id") ?? "unknown",
      },
    },
    404,
  );
});

// Global error handler.
app.onError(errorHandler());

// Cloudflare Workers `queue()` consumer. Routes messages by `kind` so a
// single consumer can fan out to multiple worker functions.
type QueueMessage =
  | RecordingUploadMessage
  | KbIndexMessage
  | WebhookDeliveryMessage
  | DunningMessage
  | QualityGradeMessage
  | EmailMessage
  | UsageAggregationMessage
  | { kind: string };

interface MessageBatch<T> {
  messages: ReadonlyArray<{ id: string; body: T; ack: () => void; retry: () => void }>;
}

interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings): Promise<void> {
    const log = createLogger((env.LOG_LEVEL ?? "info") as LogLevel, { cron: event.cron });
    log.info("cron.fired");
    // Hourly digest scan — picks orgs whose local time is 07:00 Monday.
    if (event.cron === "0 * * * *") {
      await generateWeeklyDigest(env);
    }
    // Daily 06:00 UTC — purge orgs whose deletion grace has elapsed and
    // enqueue a usage-aggregation period-close sweep so Stripe meter
    // events are reported once per day.
    if (event.cron === "0 6 * * *") {
      const result = await runScheduledDeletions(env);
      log.info("cron.deletion_purge", result);
      try {
        await env.USAGE_AGGREGATION_QUEUE.send({
          kind: "usage_aggregation_period_close",
        });
        log.info("cron.usage_aggregation_enqueued");
      } catch (err) {
        log.error("cron.usage_aggregation_enqueue_failed", {
          error: (err as Error).message,
        });
      }
    }
  },
  async queue(batch: MessageBatch<QueueMessage>, env: Bindings): Promise<void> {
    const log = createLogger((env.LOG_LEVEL ?? "info") as LogLevel, {
      queue: "consumer",
    });
    for (const msg of batch.messages) {
      try {
        if (msg.body.kind === "vapi_recording_upload") {
          await handleRecordingUpload(msg.body as RecordingUploadMessage, env);
          msg.ack();
        } else if (msg.body.kind === "kb_index") {
          await runIndexing(env, msg.body as KbIndexMessage);
          msg.ack();
        } else if (msg.body.kind === "webhook_delivery") {
          await handleWebhookDelivery(msg.body as WebhookDeliveryMessage, env);
          msg.ack();
        } else if (msg.body.kind === "dunning") {
          await handleDunning(msg.body as DunningMessage, env);
          msg.ack();
        } else if (msg.body.kind === "quality_grade") {
          await runQualityGrade(env, msg.body as QualityGradeMessage);
          msg.ack();
        } else if (
          msg.body.kind === "usage_aggregation_period_close" ||
          msg.body.kind === "usage_aggregation_org"
        ) {
          await handleUsageAggregation(msg.body as UsageAggregationMessage, env);
          msg.ack();
        } else if (
          msg.body.kind === "verify_email" ||
          msg.body.kind === "password_reset" ||
          msg.body.kind === "invite_email" ||
          msg.body.kind === "impersonation_notice" ||
          msg.body.kind === "dunning_email" ||
          msg.body.kind === "weekly_digest" ||
          msg.body.kind === "deletion_confirmation" ||
          msg.body.kind === "call_summary"
        ) {
          await handleEmailSend(env, msg.body as EmailMessage);
          msg.ack();
        } else {
          log.warn("queue.unknown_kind", { kind: msg.body.kind });
          msg.ack();
        }
      } catch (e) {
        log.error("queue.handler_failed", {
          message_id: msg.id,
          kind: msg.body.kind,
          error: (e as Error).message,
        });
        msg.retry();
      }
    }
  },
};
