import type { AppContext } from "../../types";
import { ApiError } from "../../lib/errors";
import { success } from "../../lib/responses";
import { searchSchema } from "./schemas";
import {
  deleteDoc,
  getDoc,
  listDocs,
  searchKnowledgeBase,
  uploadDoc,
} from "./logic";

function requireOrg(c: AppContext): { organization_id: string } {
  const org = c.get("organization");
  if (!org) throw ApiError.unauthenticated();
  return { organization_id: org.id };
}

export const listDocsHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const businessId = c.req.query("business_id") ?? undefined;
  const docs = await listDocs(c.env, organization_id, businessId);
  return c.json(success({ documents: docs }));
};

export const uploadDocHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const ct = c.req.header("content-type") ?? "";
  if (!ct.startsWith("multipart/form-data")) {
    throw new ApiError("BAD_REQUEST", "Expected multipart/form-data");
  }
  const form = await c.req.formData();
  const businessId = form.get("business_id");
  const file = form.get("file");
  if (typeof businessId !== "string" || !businessId) {
    throw ApiError.validation("business_id is required");
  }
  if (!(file instanceof File)) {
    throw ApiError.validation("file is required");
  }
  if (file.size > 50 * 1024 * 1024) {
    throw new ApiError("UNPROCESSABLE_ENTITY", "File exceeds 50 MB limit");
  }

  const doc = await uploadDoc(c.env, organization_id, {
    business_id: businessId,
    file_name: file.name,
    file_type: file.type || "application/octet-stream",
    body: file.stream(),
    size_bytes: file.size,
  });
  return c.json(success({ document: doc }), 201);
};

export const getDocHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const id = c.req.param("id") as string;
  const doc = await getDoc(c.env, organization_id, id);
  return c.json(success({ document: doc }));
};

export const deleteDocHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const id = c.req.param("id") as string;
  await deleteDoc(c.env, organization_id, id);
  return c.json(success({ deleted: true }));
};

export const searchHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  let body: unknown = {};
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError("BAD_REQUEST", "Invalid JSON");
  }
  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation("Invalid body", parsed.error.issues);
  const hits = await searchKnowledgeBase(
    c.env,
    organization_id,
    parsed.data.business_id,
    parsed.data.query,
    parsed.data.top_k,
  );
  return c.json(success({ hits }));
};
