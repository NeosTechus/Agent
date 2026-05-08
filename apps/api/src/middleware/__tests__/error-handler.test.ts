import { describe, expect, it } from "vitest";
import { HTTPException } from "hono/http-exception";
import { errorHandler } from "../error-handler";
import { ApiError } from "../../lib/errors";

type Ctx = Parameters<ReturnType<typeof errorHandler>>[1];

function makeCtx(env: Record<string, unknown> = {}): Ctx {
  const headers: Record<string, string> = {};
  const vars: Record<string, unknown> = {};
  return {
    get: (k: string) => vars[k],
    set: (k: string, v: unknown) => { vars[k] = v; },
    env: { LOG_LEVEL: "silent", ...env },
    req: { path: "/v1/test", method: "GET" },
    json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
    header: (k: string, v: string) => { headers[k] = v; },
  } as unknown as Ctx;
}

describe("errorHandler", () => {
  it("returns errorResponse for ApiError", async () => {
    const handler = errorHandler();
    const err = ApiError.notFound("Thing not found");
    const res = await handler(err, makeCtx());
    expect(res.status).toBe(404);
  });

  it("returns errorResponse for HTTPException", async () => {
    const handler = errorHandler();
    const err = new HTTPException(429, { message: "Too many requests" });
    const res = await handler(err, makeCtx());
    expect(res.status).toBe(429);
  });

  it("returns 500 for unknown error", async () => {
    const handler = errorHandler();
    const res = await handler(new Error("Something broke"), makeCtx({ SENTRY_DSN: undefined }));
    expect(res.status).toBe(500);
  });

  it("handles non-Error throws", async () => {
    const handler = errorHandler();
    const res = await handler("string error" as unknown as Error, makeCtx());
    expect(res.status).toBe(500);
  });

  it("maps 401 HTTPException to UNAUTHENTICATED code", async () => {
    const handler = errorHandler();
    const err = new HTTPException(401, { message: "Auth required" });
    const res = await handler(err, makeCtx());
    expect(res.status).toBe(401);
  });

  it("maps 403 HTTPException to FORBIDDEN code", async () => {
    const handler = errorHandler();
    const err = new HTTPException(403, { message: "Forbidden" });
    const res = await handler(err, makeCtx());
    expect(res.status).toBe(403);
  });

  it("maps 4xx without specific case to BAD_REQUEST", async () => {
    const handler = errorHandler();
    const err = new HTTPException(418, { message: "I'm a teapot" });
    const res = await handler(err, makeCtx());
    expect(res.status).toBe(418);
  });
});
