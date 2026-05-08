// msw handlers covering the Vapi REST surface our `VapiClient` uses.
//
// Like the Stripe mocks, every handler returns a JSON shape close enough to
// the live Vapi envelope that our parsing code stays honest. State is held
// in module-level Maps so tests can `expect(vapiStore.assistants.size)…`.
//
// Reset between tests via `resetVapiStore()` (called from the test setup
// indirectly via `server.resetHandlers()` — we re-export `resetVapiStore`
// for tests that want a clean slate mid-suite).
//
// Auth: Vapi accepts a Bearer token and an `Idempotency-Key` header. The
// mocks record the idempotency keys for assertion (handy for retry tests).

import { http, HttpResponse } from "msw";

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------
interface StoredAssistant {
  id: string;
  name: string;
  firstMessage?: string;
  metadata?: Record<string, string>;
  patches: Array<Record<string, unknown>>;
}

interface StoredCall {
  id: string;
  assistantId: string;
  phoneNumberId: string;
  customer: { number: string };
  metadata?: Record<string, string>;
  status: "queued";
}

export const vapiStore = {
  assistants: new Map<string, StoredAssistant>(),
  calls: new Map<string, StoredCall>(),
  /** All `Idempotency-Key` headers we've seen — handy for test assertions. */
  idempotencyKeys: [] as string[],
};

export function resetVapiStore(): void {
  vapiStore.assistants.clear();
  vapiStore.calls.clear();
  vapiStore.idempotencyKeys = [];
}

let nextId = 0;
function rand(prefix: string): string {
  nextId += 1;
  const hex = nextId.toString(16).padStart(8, "0");
  return `${prefix}_test_${hex}`;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
export const vapiHandlers = [
  // POST /assistant — create.
  http.post("https://api.vapi.ai/assistant", async ({ request }) => {
    const idem = request.headers.get("idempotency-key");
    if (idem) vapiStore.idempotencyKeys.push(idem);
    const body = (await request.json()) as Record<string, unknown>;
    const id = rand("vapi_asst");
    const stored: StoredAssistant = {
      id,
      name: (body.name as string) ?? "",
      firstMessage: body.firstMessage as string | undefined,
      metadata: (body.metadata as Record<string, string>) ?? {},
      patches: [],
    };
    vapiStore.assistants.set(id, stored);
    return HttpResponse.json({
      id,
      name: stored.name,
      firstMessage: stored.firstMessage,
      model: body.model,
      transcriber: body.transcriber,
      voice: body.voice,
      metadata: stored.metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }),

  // PATCH /assistant/:id — update.
  http.patch(
    "https://api.vapi.ai/assistant/:id",
    async ({ params, request }) => {
      const id = params.id as string;
      const idem = request.headers.get("idempotency-key");
      if (idem) vapiStore.idempotencyKeys.push(idem);
      const body = (await request.json()) as Record<string, unknown>;
      const stored = vapiStore.assistants.get(id) ?? {
        id,
        name: "",
        patches: [],
      };
      stored.patches.push(body);
      if (typeof body.name === "string") stored.name = body.name;
      if (typeof body.firstMessage === "string") stored.firstMessage = body.firstMessage;
      if (body.metadata && typeof body.metadata === "object") {
        stored.metadata = body.metadata as Record<string, string>;
      }
      vapiStore.assistants.set(id, stored);
      return HttpResponse.json({
        id,
        name: stored.name,
        firstMessage: stored.firstMessage,
        metadata: stored.metadata,
        updatedAt: new Date().toISOString(),
      });
    },
  ),

  // GET /assistant/:id
  http.get("https://api.vapi.ai/assistant/:id", ({ params }) => {
    const id = params.id as string;
    const stored = vapiStore.assistants.get(id);
    if (!stored) {
      // Synthesize so happy-path tests work even without explicit seed.
      return HttpResponse.json({
        id,
        name: "synthetic",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    return HttpResponse.json({
      id: stored.id,
      name: stored.name,
      firstMessage: stored.firstMessage,
      metadata: stored.metadata,
    });
  }),

  // DELETE /assistant/:id
  http.delete("https://api.vapi.ai/assistant/:id", ({ params, request }) => {
    const id = params.id as string;
    const idem = request.headers.get("idempotency-key");
    if (idem) vapiStore.idempotencyKeys.push(idem);
    vapiStore.assistants.delete(id);
    return new HttpResponse(null, { status: 204 });
  }),

  // POST /call — create outbound call.
  http.post("https://api.vapi.ai/call", async ({ request }) => {
    const idem = request.headers.get("idempotency-key");
    if (idem) vapiStore.idempotencyKeys.push(idem);
    const body = (await request.json()) as {
      assistantId: string;
      phoneNumberId: string;
      customer: { number: string };
      metadata?: Record<string, string>;
    };
    const id = rand("vapi_call");
    const stored: StoredCall = {
      id,
      assistantId: body.assistantId,
      phoneNumberId: body.phoneNumberId,
      customer: body.customer,
      metadata: body.metadata,
      status: "queued",
    };
    vapiStore.calls.set(id, stored);
    return HttpResponse.json({
      id,
      assistantId: stored.assistantId,
      phoneNumberId: stored.phoneNumberId,
      customer: stored.customer,
      metadata: stored.metadata,
      status: "queued",
      createdAt: new Date().toISOString(),
    });
  }),
];
