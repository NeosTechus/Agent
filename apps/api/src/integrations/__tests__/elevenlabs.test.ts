import { describe, expect, it, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { ElevenLabsClient, ElevenLabsError } from "../elevenlabs";

const BASE = "https://api.elevenlabs.test/v1/";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeClient() {
  // baseDelayMs: 0 — keep error-path tests under 100ms; the default 1s base
  // would compound to ~7s across 3 retries (1+2+4) for the 5xx/429 cases.
  return new ElevenLabsClient({ apiKey: "el-test-key", baseUrl: BASE, baseDelayMs: 0 });
}

describe("ElevenLabsClient.listStockVoices", () => {
  it("returns the curated STOCK_VOICES list", async () => {
    const voices = await makeClient().listStockVoices();
    expect(Array.isArray(voices)).toBe(true);
    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0]).toHaveProperty("voiceId");
    expect(voices[0]).toHaveProperty("name");
  });
});

describe("ElevenLabsClient.deleteClonedVoice", () => {
  it("resolves on 204", async () => {
    server.use(
      http.delete(`${BASE}voices/voice123`, () => new HttpResponse(null, { status: 204 })),
    );
    await expect(makeClient().deleteClonedVoice("voice123")).resolves.toBeUndefined();
  });

  it("throws ElevenLabsError on 404 with string detail", async () => {
    server.use(
      http.delete(`${BASE}voices/bad_voice`, () =>
        HttpResponse.json({ detail: "Voice not found" }, { status: 404 }),
      ),
    );
    const err = await makeClient().deleteClonedVoice("bad_voice").catch((e) => e);
    expect(err).toBeInstanceOf(ElevenLabsError);
    expect((err as ElevenLabsError).statusCode).toBe(404);
    expect((err as ElevenLabsError).message).toBe("Voice not found");
  });

  it("throws ElevenLabsError on 404 with object detail", async () => {
    server.use(
      http.delete(`${BASE}voices/bad_voice2`, () =>
        HttpResponse.json({ detail: { message: "Voice not found", status: "error" } }, { status: 404 }),
      ),
    );
    const err = await makeClient().deleteClonedVoice("bad_voice2").catch((e) => e);
    expect(err).toBeInstanceOf(ElevenLabsError);
    expect((err as ElevenLabsError).message).toBe("Voice not found");
  });

  it("throws ElevenLabsError with HTTP status fallback for non-JSON error", async () => {
    server.use(
      http.delete(`${BASE}voices/bad_voice3`, () =>
        new HttpResponse("Service Unavailable", { status: 503, headers: { "Content-Type": "text/plain" } }),
      ),
    );
    const err = await makeClient().deleteClonedVoice("bad_voice3").catch((e) => e);
    expect(err).toBeInstanceOf(ElevenLabsError);
    expect((err as ElevenLabsError).statusCode).toBe(503);
    expect((err as ElevenLabsError).message).toBe("HTTP 503");
  });
});

describe("ElevenLabsClient.getVoiceMetadata", () => {
  it("returns voice metadata", async () => {
    server.use(
      http.get(`${BASE}voices/voice123`, () =>
        HttpResponse.json({
          voice_id: "voice123",
          name: "Aria",
          category: "premade",
          description: "A warm, natural voice",
          labels: { accent: "american" },
        }),
      ),
    );
    const meta = await makeClient().getVoiceMetadata("voice123");
    expect(meta.voiceId).toBe("voice123");
    expect(meta.name).toBe("Aria");
    expect(meta.labels.accent).toBe("american");
  });

  it("handles null description and empty labels", async () => {
    server.use(
      http.get(`${BASE}voices/voice456`, () =>
        HttpResponse.json({
          voice_id: "voice456",
          name: "Bolt",
          category: "generated",
          description: null,
          labels: null,
        }),
      ),
    );
    const meta = await makeClient().getVoiceMetadata("voice456");
    expect(meta.description).toBeNull();
    expect(meta.labels).toEqual({});
  });
});

describe("ElevenLabsClient.createClonedVoice", () => {
  it("fetches samples and POSTs form-data, returns voiceId", async () => {
    server.use(
      http.get("https://samples.test/sample0.mp3", () =>
        new HttpResponse(new Uint8Array([0, 1, 2]), {
          headers: { "Content-Type": "audio/mpeg" },
        }),
      ),
      http.post(`${BASE}voices/add`, () =>
        HttpResponse.json({ voice_id: "clone_abc" }),
      ),
    );
    const result = await makeClient().createClonedVoice({
      name: "My Clone",
      sampleUrls: ["https://samples.test/sample0.mp3"],
      description: "Test voice",
    });
    expect(result.voiceId).toBe("clone_abc");
  });

  it("throws ElevenLabsError when sample fetch fails", async () => {
    server.use(
      http.get("https://samples.test/bad.mp3", () =>
        new HttpResponse(null, { status: 403 }),
      ),
    );
    const err = await makeClient()
      .createClonedVoice({ name: "Bad Clone", sampleUrls: ["https://samples.test/bad.mp3"] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ElevenLabsError);
    expect((err as ElevenLabsError).statusCode).toBe(403);
  });
});
