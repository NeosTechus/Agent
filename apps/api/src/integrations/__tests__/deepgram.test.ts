import { describe, expect, it, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { DeepgramClient, DeepgramError } from "../deepgram";

const BASE = "https://api.deepgram.test/v1/";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeClient() {
  // baseDelayMs: 0 — keep error-path tests under 100ms; the default 1s base
  // would compound to ~7s across 3 retries (1+2+4) for the 5xx/429 cases.
  return new DeepgramClient({ apiKey: "dg-test-key", baseUrl: BASE, baseDelayMs: 0 });
}

const SUCCESS_RESPONSE = {
  metadata: { duration: 12.5 },
  results: {
    channels: [
      {
        alternatives: [{ transcript: "Hello world", confidence: 0.98 }],
      },
    ],
  },
};

describe("DeepgramClient.transcribeFromUrl", () => {
  it("returns transcript and metadata on success", async () => {
    server.use(
      http.post(`${BASE}listen`, () => HttpResponse.json(SUCCESS_RESPONSE)),
    );
    const result = await makeClient().transcribeFromUrl({
      url: "https://storage.example.com/recording.mp3",
    });
    expect(result.transcript).toBe("Hello world");
    expect(result.confidence).toBe(0.98);
    expect(result.durationSeconds).toBe(12.5);
    expect(result.raw).toBeDefined();
  });

  it("returns empty transcript when alternatives are missing", async () => {
    server.use(
      http.post(`${BASE}listen`, () =>
        HttpResponse.json({ metadata: { duration: 5 }, results: { channels: [] } }),
      ),
    );
    const result = await makeClient().transcribeFromUrl({ url: "https://example.com/audio.mp3" });
    expect(result.transcript).toBe("");
    expect(result.confidence).toBe(0);
    expect(result.durationSeconds).toBe(5);
  });

  it("passes model and language query params", async () => {
    let capturedUrl = "";
    server.use(
      http.post(`${BASE}listen`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(SUCCESS_RESPONSE);
      }),
    );
    await makeClient().transcribeFromUrl({
      url: "https://example.com/audio.mp3",
      model: "nova-2",
      language: "es",
      diarize: true,
    });
    const u = new URL(capturedUrl);
    expect(u.searchParams.get("model")).toBe("nova-2");
    expect(u.searchParams.get("language")).toBe("es");
    expect(u.searchParams.get("diarize")).toBe("true");
  });

  it("throws DeepgramError on 401 with err_msg", async () => {
    server.use(
      http.post(`${BASE}listen`, () =>
        HttpResponse.json({ err_msg: "Invalid credentials", err_code: "INVALID_AUTH" }, { status: 401 }),
      ),
    );
    const err = await makeClient()
      .transcribeFromUrl({ url: "https://example.com/audio.mp3" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(DeepgramError);
    expect((err as DeepgramError).statusCode).toBe(401);
    expect((err as DeepgramError).message).toBe("Invalid credentials");
  });

  it("throws DeepgramError on 500 with message fallback", async () => {
    server.use(
      http.post(`${BASE}listen`, () =>
        HttpResponse.json({ message: "Internal error" }, { status: 500 }),
      ),
    );
    const err = await makeClient()
      .transcribeFromUrl({ url: "https://example.com/audio.mp3" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(DeepgramError);
    expect((err as DeepgramError).message).toBe("Internal error");
  });

  it("throws DeepgramError on non-JSON error body", async () => {
    server.use(
      http.post(`${BASE}listen`, () =>
        new HttpResponse("Bad Gateway", { status: 502, headers: { "Content-Type": "text/plain" } }),
      ),
    );
    const err = await makeClient()
      .transcribeFromUrl({ url: "https://example.com/audio.mp3" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(DeepgramError);
    expect((err as DeepgramError).statusCode).toBe(502);
    expect((err as DeepgramError).message).toBe("HTTP 502");
  });
});
