import { apiPost } from "./api-client";

export interface ComposerMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ComposerChatResponse {
  reply: string;
  model: string;
}

export function composerChat(
  messages: ComposerMessage[],
  signal?: AbortSignal,
): Promise<ComposerChatResponse> {
  return apiPost<ComposerChatResponse>("/v1/composer/chat", { messages }, { signal });
}
