import type { AppContext } from "../../types";
import { ApiError } from "../../lib/errors";
import { success } from "../../lib/responses";
import { composerChatSchema } from "./schemas";
import { chat } from "./logic";

export const chatHandler = async (c: AppContext) => {
  const user = c.get("user");
  if (!user) throw ApiError.unauthenticated();

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError("BAD_REQUEST", "Invalid JSON");
  }
  const parsed = composerChatSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation("Validation failed", parsed.error.issues);

  const result = await chat(c.env, parsed.data.messages);
  return c.json(success(result));
};
