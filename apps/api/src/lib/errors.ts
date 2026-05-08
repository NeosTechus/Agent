// Standardized error class + error-code registry per PRD 7.6.2.
// Throw an `ApiError` from any handler/middleware and the global error
// middleware will format the response envelope and HTTP status correctly.

/**
 * Canonical error codes (SCREAMING_SNAKE_CASE). Add new codes here and map
 * them in `STATUS_BY_CODE` below.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE_ENTITY"
  | "RATE_LIMITED"
  | "PAYMENT_REQUIRED"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE";

/** Default HTTP status for each error code. */
export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  RATE_LIMITED: 429,
  PAYMENT_REQUIRED: 402,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { status?: number; details?: unknown; cause?: unknown },
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = options?.status ?? STATUS_BY_CODE[code];
    this.details = options?.details;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }

  // Convenience factories — keep call sites readable.
  static validation(message: string, details?: unknown): ApiError {
    return new ApiError("VALIDATION_ERROR", message, { details });
  }
  static unauthenticated(message = "Authentication required"): ApiError {
    return new ApiError("UNAUTHENTICATED", message);
  }
  static forbidden(message = "Forbidden"): ApiError {
    return new ApiError("FORBIDDEN", message);
  }
  static notFound(message = "Not found"): ApiError {
    return new ApiError("NOT_FOUND", message);
  }
  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError("CONFLICT", message, { details });
  }
  static rateLimited(message = "Too many requests"): ApiError {
    return new ApiError("RATE_LIMITED", message);
  }
  static internal(message = "Internal server error", cause?: unknown): ApiError {
    return new ApiError("INTERNAL_ERROR", message, { cause });
  }
}
