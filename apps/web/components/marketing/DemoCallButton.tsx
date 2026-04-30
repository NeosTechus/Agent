"use client";

import * as React from "react";
import { Button, Spinner } from "@/components/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void },
      ) => string;
      reset: (id?: string) => void;
    };
    Vapi?: new (publicKey: string) => {
      start: (assistantId: string, opts?: { variableValues?: Record<string, string> }) => void;
      stop: () => void;
      on: (event: string, handler: (data?: unknown) => void) => void;
    };
  }
}

interface DemoConfig {
  vapi_public_key: string;
  assistant_id: string;
  vertical?: string;
  display_name?: string;
  sample_questions?: string[];
  personalization: { business_name: string } | null;
  max_duration_seconds: number;
}

interface CatalogEntry {
  vertical: string;
  display_name: string;
  description: string;
  sample_questions: string[];
}

export function DemoCallButton() {
  const [businessName, setBusinessName] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "starting" | "live" | "ended" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [token, setToken] = React.useState<string | null>(null);
  const [catalog, setCatalog] = React.useState<CatalogEntry[]>([]);
  const [vertical, setVertical] = React.useState<string | undefined>(undefined);
  const [activeAgent, setActiveAgent] = React.useState<DemoConfig | null>(null);
  const widgetRef = React.useRef<HTMLDivElement | null>(null);
  const vapiRef = React.useRef<InstanceType<NonNullable<Window["Vapi"]>> | null>(null);

  // Pull the catalog so we can render a vertical chooser if more than one
  // demo agent is configured. Falls back to the legacy single-demo path
  // when the catalog is empty.
  React.useEffect(() => {
    fetch(`${API_URL}/v1/demo/catalog`)
      .then((r) => r.json())
      .then((j) => {
        const entries = (j.data?.catalog ?? []) as CatalogEntry[];
        setCatalog(entries);
        if (entries.length > 0) setVertical(entries[0]?.vertical);
      })
      .catch(() => {
        /* catalog unavailable — fall back to default demo */
      });
  }, []);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const tsScript = document.createElement("script");
    tsScript.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    tsScript.async = true;
    tsScript.defer = true;
    document.head.appendChild(tsScript);
    const vapiScript = document.createElement("script");
    vapiScript.src = "https://cdn.jsdelivr.net/gh/VapiAI/html-script-tag@latest/dist/assets/index.js";
    vapiScript.async = true;
    document.head.appendChild(vapiScript);
    return () => {
      tsScript.remove();
      vapiScript.remove();
    };
  }, []);

  React.useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !widgetRef.current) return;
    const interval = setInterval(() => {
      if (window.turnstile && widgetRef.current && !widgetRef.current.dataset.rendered) {
        widgetRef.current.dataset.rendered = "1";
        window.turnstile.render(widgetRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (t) => setToken(t),
        });
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const startCall = async () => {
    if (!token && TURNSTILE_SITE_KEY) {
      setErrorMsg("Please complete the human-check first.");
      return;
    }
    setStatus("starting");
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_URL}/v1/demo/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName || undefined,
          vertical,
          turnstile_token: token ?? "dev",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Demo unavailable");
      const config = json.data as DemoConfig;
      setActiveAgent(config);
      if (!window.Vapi) throw new Error("Voice client not loaded yet");
      const vapi = new window.Vapi(config.vapi_public_key);
      vapiRef.current = vapi;
      vapi.on("call-end", () => setStatus("ended"));
      vapi.on("error", () => setStatus("error"));
      vapi.start(config.assistant_id, {
        variableValues: config.personalization
          ? { business_name: config.personalization.business_name }
          : undefined,
      });
      setStatus("live");
      setTimeout(() => {
        vapiRef.current?.stop();
        setStatus("ended");
      }, config.max_duration_seconds * 1000);
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStatus("error");
    }
  };

  const endCall = () => {
    vapiRef.current?.stop();
    setStatus("ended");
  };

  const featuredVertical = catalog.find((c) => c.vertical === vertical);
  const headlineName = featuredVertical?.display_name ?? "Mario's Pizza";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-ink">Try it before you sign up</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Talk to our demo agent for {headlineName}. Ask about hours, services, bookings — it'll
        reply just like a real receptionist.
      </p>
      <div className="mt-4 space-y-3">
        {catalog.length > 1 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Pick a business type
            </label>
            <select
              value={vertical ?? ""}
              onChange={(e) => setVertical(e.target.value || undefined)}
              disabled={status === "live" || status === "starting"}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {catalog.map((c) => (
                <option key={c.vertical} value={c.vertical}>
                  {c.display_name} — {c.description}
                </option>
              ))}
            </select>
          </div>
        )}
        <input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Or try as your business — enter your business name"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          disabled={status === "live" || status === "starting"}
        />
        {TURNSTILE_SITE_KEY && <div ref={widgetRef} className="cf-turnstile" />}
        {status === "live" ? (
          <Button onClick={endCall} variant="secondary">
            End call
          </Button>
        ) : (
          <Button onClick={startCall} disabled={status === "starting"}>
            {status === "starting" ? <Spinner /> : "Call from your browser"}
          </Button>
        )}
        {(featuredVertical?.sample_questions?.length ?? 0) > 0 && status !== "live" && (
          <div className="rounded-md bg-slate-50 p-3 text-xs text-ink-muted">
            <p className="mb-1 font-medium text-ink">Try asking:</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {featuredVertical?.sample_questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}
        {(activeAgent?.sample_questions?.length ?? 0) > 0 && status === "live" && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <p className="mb-1 font-medium">You're live with {activeAgent?.display_name}. Try:</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {activeAgent?.sample_questions?.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}
        {status === "ended" && (
          <p className="text-sm text-emerald-700">
            Call ended. Want this for your business? <a href="/signup" className="underline">Get started →</a>
          </p>
        )}
        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
        <p className="text-xs text-ink-muted">
          Or call <strong>+1 (555) 555-DEMO</strong> from your phone. Calls capped at 3 minutes.
        </p>
      </div>
    </div>
  );
}
