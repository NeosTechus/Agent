"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { composerChat, type ComposerMessage } from "@/lib/composer";
import { ApiError } from "@/lib/api-client";

interface StarterCard {
  title: string;
  blurb: string;
  prompt: string;
}

const STARTERS: StarterCard[] = [
  {
    title: "Build",
    blurb: "Draft a system prompt or first message for a new agent.",
    prompt:
      "Help me draft a system prompt and first message for a new inbound receptionist agent. Ask me 2-3 questions first about my business so the prompt is tailored.",
  },
  {
    title: "Debug",
    blurb: "Walk through why a call went wrong.",
    prompt:
      "A recent call didn't go well — what should I check first inside Agent P to figure out what happened?",
  },
  {
    title: "Analyze",
    blurb: "Understand my plan, usage, and overage exposure.",
    prompt:
      "Explain how minutes, plans, and overage billing work. How can I tell if I'm at risk of hitting my limit this period?",
  },
  {
    title: "Test",
    blurb: "Run a test call and verify the agent end-to-end.",
    prompt:
      "Walk me through how to run a test call against my agent and what to look for to confirm it's working.",
  },
];

export default function ComposerPage() {
  const [messages, setMessages] = React.useState<ComposerMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);

  const mutation = useMutation({
    mutationFn: (next: ComposerMessage[]) => composerChat(next),
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    },
  });

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, mutation.isPending]);

  function send(content: string) {
    const trimmed = content.trim();
    if (!trimmed || mutation.isPending) return;
    const next: ComposerMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setDraft("");
    mutation.mutate(next);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleStarter(card: StarterCard) {
    send(card.prompt);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  }

  function reset() {
    setMessages([]);
    setDraft("");
    mutation.reset();
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const errorMessage = mutation.error
    ? mutation.error instanceof ApiError
      ? mutation.error.message
      : "Something went wrong. Try again."
    : null;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Composer</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Ask the assistant for help with prompts, calls, billing, or anything else inside Agent P.
          </p>
        </div>
        {messages.length > 0 ? (
          <Button variant="secondary" size="sm" onClick={reset}>
            New thread
          </Button>
        ) : null}
      </header>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto rounded-lg border border-border bg-white p-4 shadow-sm"
      >
        {messages.length === 0 && !mutation.isPending ? (
          <div className="flex h-full flex-col">
            <div className="mb-6">
              <h2 className="text-sm font-medium text-ink">Start with one of these</h2>
              <p className="mt-1 text-xs text-ink-muted">
                Or just type a question below.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {STARTERS.map((card) => (
                <button
                  key={card.title}
                  type="button"
                  onClick={() => handleStarter(card)}
                  className="group rounded-lg border border-border bg-white p-4 text-left transition-colors hover:border-slate-300 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <p className="text-sm font-semibold text-ink">{card.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    {card.blurb}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <MessageBubble key={i} role={m.role} content={m.content} />
            ))}
            {mutation.isPending ? <TypingBubble /> : null}
          </div>
        )}
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="rounded-lg border border-border bg-white p-2 shadow-sm focus-within:border-primary"
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask the Composer…   (Enter to send, Shift+Enter for newline)"
          rows={2}
          className="w-full resize-none bg-transparent px-2 py-1.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none"
          disabled={mutation.isPending}
        />
        <div className="flex items-center justify-between px-1 pt-1">
          <p className="text-[11px] text-ink-muted">
            Powered by Groq · responses are best-effort
          </p>
          <Button
            type="submit"
            size="sm"
            disabled={!draft.trim() || mutation.isPending}
          >
            {mutation.isPending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-surface text-ink",
        )}
      >
        {content}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="rounded-lg bg-surface px-3 py-2">
        <span className="inline-flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted" />
        </span>
      </div>
    </div>
  );
}
