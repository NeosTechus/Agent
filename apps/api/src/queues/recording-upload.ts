// Queue consumer: download a Vapi recording, upload to R2, rewrite the
// `calls.recording_r2_url` to point at the R2 key.
//
// Triggered from `services/calls/logic.ts:applyVapiMutation` after the Vapi
// `end-of-call-report` arrives. Doing this work async keeps the webhook
// response under 1s (PRD 9.10 — webhook delivery under 1s after call ends).

import type { Bindings } from "../env";
import { createLogger, type LogLevel } from "../lib/logger";

export interface RecordingUploadMessage {
  kind: "vapi_recording_upload";
  call_id: string;
  organization_id: string;
  recording_url: string;
}

export async function handleRecordingUpload(
  msg: RecordingUploadMessage,
  env: Bindings,
): Promise<void> {
  const log = createLogger((env.LOG_LEVEL ?? "info") as LogLevel, {
    queue: "webhook-delivery",
    handler: "recording-upload",
    call_id: msg.call_id,
  });

  // Download the recording from Vapi's signed URL.
  const res = await fetch(msg.recording_url, {
    headers: env.VAPI_API_KEY ? { Authorization: `Bearer ${env.VAPI_API_KEY}` } : {},
  });
  if (!res.ok || !res.body) {
    log.error("recording.download_failed", { status: res.status });
    throw new Error(`recording download failed: ${res.status}`);
  }
  const contentType = res.headers.get("content-type") ?? "audio/mpeg";
  const ext = contentType.includes("wav") ? "wav" : "mp3";
  const r2Key = `recordings/${msg.organization_id}/${msg.call_id}.${ext}`;

  // Stream into R2.
  await env.RECORDINGS.put(r2Key, res.body, {
    httpMetadata: { contentType },
    customMetadata: { call_id: msg.call_id, organization_id: msg.organization_id },
  });

  // Rewrite the call row to the R2 key.
  await env.DB.prepare(
    `UPDATE calls
        SET recording_r2_url = ?, updated_at = ?
      WHERE id = ? AND organization_id = ?`,
  )
    .bind(r2Key, Math.floor(Date.now() / 1000), msg.call_id, msg.organization_id)
    .run();

  log.info("recording.uploaded", { r2_key: r2Key });
}
