// Knowledge-base business logic.
//
// Upload pipeline:
//   1. POST /v1/knowledge-base — multipart upload; stream into R2.
//   2. Persist a row in `knowledge_base_documents`.
//   3. Enqueue an indexing job (`kb_index`) that chunks the text and writes
//      embeddings to Vectorize.
//
// Search pipeline:
//   1. POST /v1/knowledge-base/search — embed the query via Workers AI.
//   2. Vectorize.query() with the org+business namespace.
//   3. Return chunks with metadata.

import { ApiError } from "../../lib/errors";
import type { Bindings } from "../../env";
import type { KbDoc } from "./schemas";

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const CHUNK_TARGET_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 200;

interface KbDocRow {
  id: string;
  business_id: string;
  organization_id: string;
  file_name: string;
  file_type: string;
  r2_url: string;
  size_bytes: number;
  indexed_at: number | null;
  vector_namespace: string | null;
  created_at: number;
  updated_at: number;
}

function rowToDoc(r: KbDocRow): KbDoc {
  return { ...r };
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}
function now(): number {
  return Math.floor(Date.now() / 1000);
}

export function namespaceFor(orgId: string, businessId: string): string {
  return `org:${orgId}:biz:${businessId}`;
}

export async function listDocs(
  env: Bindings,
  organizationId: string,
  businessId: string | undefined,
): Promise<KbDoc[]> {
  const sql = businessId
    ? `SELECT id, business_id, organization_id, file_name, file_type, r2_url, size_bytes,
              indexed_at, vector_namespace, created_at, updated_at
         FROM knowledge_base_documents
        WHERE organization_id = ? AND business_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC`
    : `SELECT id, business_id, organization_id, file_name, file_type, r2_url, size_bytes,
              indexed_at, vector_namespace, created_at, updated_at
         FROM knowledge_base_documents
        WHERE organization_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC`;
  const stmt = businessId
    ? env.DB.prepare(sql).bind(organizationId, businessId)
    : env.DB.prepare(sql).bind(organizationId);
  const result = await stmt.all<KbDocRow>();
  return (result.results ?? []).map(rowToDoc);
}

/**
 * Verify a business belongs to an organization. Throws 404 otherwise.
 */
export async function assertBusinessInOrg(
  env: Bindings,
  organizationId: string,
  businessId: string,
): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT id FROM businesses WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
  )
    .bind(businessId, organizationId)
    .first<{ id: string }>();
  if (!row) throw ApiError.notFound("Business not found");
}

/**
 * Stream-upload a file to R2 and persist a row. Returns the doc + a
 * pending indexing-job message for the caller to enqueue.
 */
export async function uploadDoc(
  env: Bindings,
  organizationId: string,
  input: { business_id: string; file_name: string; file_type: string; body: ReadableStream | ArrayBuffer | string; size_bytes: number },
): Promise<KbDoc> {
  await assertBusinessInOrg(env, organizationId, input.business_id);

  const id = newId("kbd");
  const r2Key = `kb/${organizationId}/${input.business_id}/${id}/${sanitizeFileName(input.file_name)}`;
  await env.KNOWLEDGE_BASE.put(r2Key, input.body, {
    httpMetadata: { contentType: input.file_type },
    customMetadata: {
      organization_id: organizationId,
      business_id: input.business_id,
      file_name: input.file_name,
    },
  });

  const ts = now();
  await env.DB.prepare(
    `INSERT INTO knowledge_base_documents (
       id, business_id, organization_id, file_name, file_type, r2_url, size_bytes,
       indexed_at, vector_namespace, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
  )
    .bind(
      id,
      input.business_id,
      organizationId,
      input.file_name,
      input.file_type,
      r2Key,
      input.size_bytes,
      namespaceFor(organizationId, input.business_id),
      ts,
      ts,
    )
    .run();

  // Enqueue indexing.
  try {
    await env.KB_INDEXING_QUEUE.send({
      kind: "kb_index",
      doc_id: id,
      organization_id: organizationId,
      business_id: input.business_id,
      r2_key: r2Key,
      file_type: input.file_type,
    });
  } catch {
    // Best-effort. The doc row is written; a sweeper can re-enqueue.
  }

  return getDoc(env, organizationId, id);
}

export async function getDoc(
  env: Bindings,
  organizationId: string,
  docId: string,
): Promise<KbDoc> {
  const row = await env.DB.prepare(
    `SELECT id, business_id, organization_id, file_name, file_type, r2_url, size_bytes,
            indexed_at, vector_namespace, created_at, updated_at
       FROM knowledge_base_documents
      WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
  )
    .bind(docId, organizationId)
    .first<KbDocRow>();
  if (!row) throw ApiError.notFound("Document not found");
  return rowToDoc(row);
}

export async function deleteDoc(
  env: Bindings,
  organizationId: string,
  docId: string,
): Promise<void> {
  const doc = await getDoc(env, organizationId, docId);
  await env.KNOWLEDGE_BASE.delete(doc.r2_url);
  if (doc.vector_namespace) {
    try {
      await env.VECTORIZE.deleteByIds([`${doc.vector_namespace}:${doc.id}`]);
    } catch {
      // Vectorize may not have indexed yet — fine.
    }
  }
  await env.DB.prepare(
    `UPDATE knowledge_base_documents SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND organization_id = ?`,
  )
    .bind(now(), now(), docId, organizationId)
    .run();
}

// ---------------------------------------------------------------------------
// Indexing pipeline (called from queue consumer)
// ---------------------------------------------------------------------------

export interface KbIndexMessage {
  kind: "kb_index";
  doc_id: string;
  organization_id: string;
  business_id: string;
  r2_key: string;
  file_type: string;
}

export async function runIndexing(env: Bindings, msg: KbIndexMessage): Promise<void> {
  // Pull the file from R2.
  const obj = await env.KNOWLEDGE_BASE.get(msg.r2_key);
  if (!obj) {
    throw new Error(`r2_object_missing:${msg.r2_key}`);
  }

  // Extract text by file type:
  //   - text/* + JSON → read as string
  //   - PDF (application/pdf or filename ending .pdf) → unpdf (Workers-safe,
  //     PDF.js stripped down for serverless)
  //   - everything else → noop (DOCX deferred — needs mammoth.js)
  let text: string;
  if (msg.file_type.startsWith("text/") || msg.file_type === "application/json") {
    text = await obj.text();
  } else if (msg.file_type === "application/pdf" || msg.r2_key.endsWith(".pdf")) {
    text = await extractPdfText(await obj.arrayBuffer());
  } else {
    // TODO(integrations-agent): wire mammoth.js for DOCX.
    text = "";
  }

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    // Empty / unsupported file — mark indexed with 0 vectors so we don't retry forever.
    await env.DB.prepare(
      `UPDATE knowledge_base_documents SET indexed_at = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(now(), now(), msg.doc_id)
      .run();
    return;
  }

  // Batch-embed via Workers AI. The model returns one vector per input.
  const embedRes = (await env.AI.run(EMBEDDING_MODEL, { text: chunks })) as { data: number[][] };
  const vectors = embedRes.data.map((values, i) => ({
    id: `${namespaceFor(msg.organization_id, msg.business_id)}:${msg.doc_id}:${i}`,
    values,
    namespace: namespaceFor(msg.organization_id, msg.business_id),
    metadata: {
      doc_id: msg.doc_id,
      chunk_index: i,
      organization_id: msg.organization_id,
      business_id: msg.business_id,
      // Truncate the chunk text in metadata so we can render it later
      // without re-fetching from R2 — Vectorize metadata is small.
      text: chunks[i]?.slice(0, 1000) ?? "",
    },
  }));

  await env.VECTORIZE.upsert(vectors);

  await env.DB.prepare(
    `UPDATE knowledge_base_documents SET indexed_at = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(now(), now(), msg.doc_id)
    .run();
}

/**
 * Extract text from a PDF using `unpdf` — a Workers-compatible build of
 * PDF.js that omits Node-specific bits (workers, fonts, etc.). Returns the
 * concatenated text content; on parse failure returns an empty string so
 * the indexer marks the doc indexed-with-zero-chunks rather than retrying
 * forever on a corrupt file.
 */
async function extractPdfText(buf: ArrayBuffer): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const result = (await extractText(pdf, { mergePages: true })) as {
      text: string | string[];
    };
    const t: unknown = result.text;
    if (typeof t === "string") return t;
    if (Array.isArray(t)) return (t as string[]).join("\n\n");
    return "";
  } catch {
    return "";
  }
}

function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  const out: string[] = [];
  let i = 0;
  while (i < trimmed.length) {
    const end = Math.min(i + CHUNK_TARGET_CHARS, trimmed.length);
    out.push(trimmed.slice(i, end));
    if (end >= trimmed.length) break;
    i = end - CHUNK_OVERLAP_CHARS;
  }
  return out;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-]/g, "_").slice(0, 200);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchHit {
  doc_id: string;
  chunk_index: number;
  score: number;
  text: string;
}

export async function searchKnowledgeBase(
  env: Bindings,
  organizationId: string,
  businessId: string,
  query: string,
  topK: number,
): Promise<SearchHit[]> {
  await assertBusinessInOrg(env, organizationId, businessId);
  const embed = (await env.AI.run(EMBEDDING_MODEL, { text: [query] })) as { data: number[][] };
  const queryVec = embed.data[0];
  if (!queryVec) return [];

  const ns = namespaceFor(organizationId, businessId);
  const result = (await env.VECTORIZE.query(queryVec, {
    topK,
    namespace: ns,
    returnMetadata: true,
  })) as { matches: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> };

  return result.matches.map((m) => ({
    doc_id: String(m.metadata?.doc_id ?? ""),
    chunk_index: Number(m.metadata?.chunk_index ?? 0),
    score: m.score,
    text: String(m.metadata?.text ?? ""),
  }));
}
