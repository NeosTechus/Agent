// Unit tests for the recording upload queue worker.

import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../tests/mocks/server";
import { handleRecordingUpload, type RecordingUploadMessage } from "../recording-upload";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeR2() {
  const objects: Map<string, { body: unknown; meta: unknown }> = new Map();
  return {
    async put(key: string, body: unknown, opts?: unknown) {
      objects.set(key, { body, meta: opts });
    },
    objects,
  };
}

function makeDb() {
  const rows: Array<{ sql: string; args: unknown[] }> = [];
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              rows.push({ sql, args });
              return { success: true };
            },
          };
        },
      };
    },
    rows,
  };
}

function makeEnv() {
  const r2 = makeR2();
  const db = makeDb();
  return {
    env: {
      RECORDINGS: r2,
      DB: db,
      VAPI_API_KEY: "test_vapi_key",
      LOG_LEVEL: "silent",
    } as unknown as Parameters<typeof handleRecordingUpload>[1],
    r2,
    db,
  };
}

const BASE_MSG: RecordingUploadMessage = {
  kind: "vapi_recording_upload",
  call_id: "cll_01",
  organization_id: "org_01",
  recording_url: "https://storage.vapi.ai/recordings/test.mp3",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("handleRecordingUpload — happy path (mp3)", () => {
  it("downloads the recording, uploads to R2 with correct key, and updates the call row", async () => {
    const fakeAudio = new Uint8Array([0xff, 0xfb, 0x90, 0x00]).buffer;
    server.use(
      http.get("https://storage.vapi.ai/recordings/test.mp3", () =>
        new HttpResponse(fakeAudio, {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        }),
      ),
    );

    const { env, r2, db } = makeEnv();
    await handleRecordingUpload(BASE_MSG, env);

    const expectedKey = "recordings/org_01/cll_01.mp3";
    expect(r2.objects.has(expectedKey)).toBe(true);

    const updateRows = db.rows.filter((r) => r.sql.includes("UPDATE calls"));
    expect(updateRows).toHaveLength(1);
    expect(updateRows[0]!.args[0]).toBe(expectedKey);
  });
});

describe("handleRecordingUpload — wav content-type", () => {
  it("uses .wav extension when the response content-type is audio/wav", async () => {
    const fakeAudio = new Uint8Array([0x52, 0x49, 0x46, 0x46]).buffer;
    server.use(
      http.get("https://storage.vapi.ai/recordings/test.mp3", () =>
        new HttpResponse(fakeAudio, {
          status: 200,
          headers: { "Content-Type": "audio/wav" },
        }),
      ),
    );

    const { env, r2 } = makeEnv();
    await handleRecordingUpload(BASE_MSG, env);
    const expectedKey = "recordings/org_01/cll_01.wav";
    expect(r2.objects.has(expectedKey)).toBe(true);
  });
});

describe("handleRecordingUpload — download failure", () => {
  it("throws when the recording download returns a non-2xx status", async () => {
    server.use(
      http.get("https://storage.vapi.ai/recordings/test.mp3", () =>
        new HttpResponse(null, { status: 404 }),
      ),
    );
    const { env } = makeEnv();
    await expect(handleRecordingUpload(BASE_MSG, env)).rejects.toThrow(
      "recording download failed",
    );
  });
});
