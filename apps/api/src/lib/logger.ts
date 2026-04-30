// Structured logger primitive.
// Console-based today; the shape is Sentry/Logpush-compatible so the
// observability layer (PRD 7.5.6) can ingest these without re-formatting.
// Replace the sink in one place when wiring real transport.

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogFields {
  request_id?: string;
  user_id?: string;
  organization_id?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(bound: LogFields): Logger;
}

function shouldEmit(level: LogLevel, threshold: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[threshold];
}

function emit(level: LogLevel, message: string, fields: LogFields): void {
  const record = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  };
  // Cloudflare Workers ships console.* to logs/Logpush. Use the matching
  // method per level so log filtering (`wrangler tail --status error`) works.
  const line = JSON.stringify(record);
  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "debug":
      console.debug(line);
      break;
    default:
      console.log(line);
  }
}

export function createLogger(
  threshold: LogLevel = "info",
  bound: LogFields = {},
): Logger {
  const make = (level: LogLevel) => (message: string, fields?: LogFields) => {
    if (!shouldEmit(level, threshold)) return;
    emit(level, message, { ...bound, ...(fields ?? {}) });
  };
  return {
    debug: make("debug"),
    info: make("info"),
    warn: make("warn"),
    error: make("error"),
    child(extra: LogFields): Logger {
      return createLogger(threshold, { ...bound, ...extra });
    },
  };
}

/** Default module-level logger; per-request loggers should be derived via `child()`. */
export const logger = createLogger();
