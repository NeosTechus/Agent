"use client";

import { useQuery } from "@tanstack/react-query";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

interface StatusResponse {
  status: "operational" | "degraded";
  components: Record<string, { ok: boolean; latency_ms: number; error?: string }>;
}

const LABELS: Record<string, string> = {
  api: "API",
  database: "Database",
  sessions: "Sessions",
  storage: "File storage",
  stripe: "Billing (Stripe)",
  vapi: "Voice (Vapi)",
  twilio: "Telephony (Twilio)",
  elevenlabs: "Voice synthesis (ElevenLabs)",
};

export default function StatusPage() {
  const query = useQuery({
    queryKey: ["status"],
    queryFn: async (): Promise<StatusResponse> => {
      const res = await fetch(`${API_URL}/status`);
      const json = await res.json();
      return (json.data ?? json) as StatusResponse;
    },
    refetchInterval: 30_000,
  });

  return (
    <section className="mx-auto max-w-content px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-white md:text-[40px]">
        System status
      </h1>
      {query.isLoading ? (
        <p className="mt-6 text-slate-300">Checking…</p>
      ) : query.isError ? (
        <p className="mt-6 text-red-600">Could not reach the status endpoint.</p>
      ) : query.data ? (
        <>
          <div
            className={`mt-6 rounded-md border p-4 text-sm ${
              query.data.status === "operational"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            All systems are{" "}
            <strong>
              {query.data.status === "operational" ? "operational" : "experiencing issues"}
            </strong>
            .
          </div>
          <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {Object.entries(query.data.components).map(([key, c]) => (
              <li key={key} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-ink">{LABELS[key] ?? key}</span>
                <span
                  className={`text-xs font-medium ${
                    c.ok ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {c.ok ? `Operational · ${c.latency_ms}ms` : `Down · ${c.error ?? "error"}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
