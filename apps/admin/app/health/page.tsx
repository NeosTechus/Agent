"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import {
  adminApi,
  type HealthComponent,
  type HealthComponentName,
  type HealthResponse,
} from "@/lib/api";

const COMPONENT_ORDER: HealthComponentName[] = [
  "api",
  "database",
  "sessions",
  "storage",
  "stripe",
  "vapi",
  "twilio",
  "elevenlabs",
];

const COMPONENT_LABEL: Record<HealthComponentName, string> = {
  api: "API",
  database: "Database",
  sessions: "Sessions",
  storage: "Storage",
  stripe: "Stripe",
  vapi: "Vapi",
  twilio: "Twilio",
  elevenlabs: "ElevenLabs",
};

const HISTORY_LIMIT = 24;

interface Reading {
  latency_ms: number;
  ok: boolean;
}

type HistoryMap = Record<HealthComponentName, Reading[]>;

function emptyHistory(): HistoryMap {
  return COMPONENT_ORDER.reduce((acc, name) => {
    acc[name] = [];
    return acc;
  }, {} as HistoryMap);
}

function formatRelative(ts: number | null, now: number): string {
  if (ts === null) return "never";
  const diff = Math.max(0, Math.floor((now - ts) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

function Sparkline({ readings }: { readings: Reading[] }) {
  const W = 80;
  const H = 24;
  if (readings.length === 0) {
    return (
      <svg width={W} height={H} className="block" aria-hidden="true">
        <line
          x1={0}
          y1={H / 2}
          x2={W}
          y2={H / 2}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="2 3"
          className="text-slate-700"
        />
      </svg>
    );
  }

  const lastOk = readings[readings.length - 1]?.ok ?? true;
  const stroke = lastOk ? "#34d399" /* emerald-400 */ : "#f87171" /* red-400 */;

  // Normalize Y based on min/max latency, with a tiny floor so a flat line still renders mid-height.
  const values = readings.map((r) => r.latency_ms);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const stepX = readings.length > 1 ? W / (readings.length - 1) : 0;
  const points = readings.map((r, i) => {
    const x = readings.length === 1 ? W / 2 : i * stepX;
    const norm = (r.latency_ms - min) / span;
    // Invert: higher latency = lower y (closer to bottom).
    const y = H - 2 - norm * (H - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={W} height={H} className="block" aria-hidden="true">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
    </svg>
  );
}

function StatusPill({
  state,
}: {
  state: "operational" | "degraded" | "error" | "loading";
}) {
  if (state === "loading") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-slate-500" />
        Checking…
      </span>
    );
  }
  if (state === "operational") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-700/50 bg-emerald-900/30 px-3 py-1 text-xs font-medium text-emerald-300">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        Operational
      </span>
    );
  }
  if (state === "degraded") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-amber-700/50 bg-amber-900/30 px-3 py-1 text-xs font-medium text-amber-300">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        Degraded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-red-700/50 bg-red-900/30 px-3 py-1 text-xs font-medium text-red-300">
      <span className="h-2 w-2 rounded-full bg-red-400" />
      Unreachable
    </span>
  );
}

function KpiTile({
  label,
  value,
  alert,
}: {
  label: string;
  value: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded border bg-slate-900/40 px-3 py-2.5 ${
        alert ? "border-red-700/60" : "border-slate-800"
      }`}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          alert ? "text-red-300" : "text-slate-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ComponentCard({
  name,
  component,
  history,
}: {
  name: HealthComponentName;
  component: HealthComponent | undefined;
  history: Reading[];
}) {
  const ok = component?.ok ?? false;
  const dotColor = component
    ? ok
      ? "bg-emerald-400"
      : "bg-red-400"
    : "bg-slate-600";
  const latency = component ? `${component.latency_ms} ms` : "—";

  return (
    <div className="flex flex-col gap-2 rounded border border-slate-800 bg-slate-900/40 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dotColor}`} aria-hidden="true" />
          <span className="text-sm font-medium text-slate-100">
            {COMPONENT_LABEL[name]}
          </span>
        </div>
        <span className="text-xs tabular-nums text-slate-400">{latency}</span>
      </div>
      <div className="text-slate-400">
        <Sparkline readings={history} />
      </div>
      {component?.error ? (
        <p className="truncate text-xs text-red-400/90" title={component.error}>
          {component.error}
        </p>
      ) : null}
    </div>
  );
}

export default function HealthPage() {
  const [history, setHistory] = React.useState<HistoryMap>(emptyHistory);
  const [lastUpdated, setLastUpdated] = React.useState<number | null>(null);
  // Tick once a second so the relative timestamp re-renders without re-fetching.
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const healthQuery = useQuery<HealthResponse, Error>({
    queryKey: ["admin", "ops", "health"],
    queryFn: () => adminApi.ops.health(),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    retry: 0,
    staleTime: 0,
  });

  const data = healthQuery.data;

  // Append a new reading per component on each successful fetch.
  React.useEffect(() => {
    if (!data) return;
    setHistory((prev) => {
      const next: HistoryMap = { ...prev };
      for (const name of COMPONENT_ORDER) {
        const c = data.components[name];
        if (!c) continue;
        const arr = [...(prev[name] ?? []), { latency_ms: c.latency_ms, ok: c.ok }];
        if (arr.length > HISTORY_LIMIT) arr.splice(0, arr.length - HISTORY_LIMIT);
        next[name] = arr;
      }
      return next;
    });
    setLastUpdated(Date.now());
  }, [data]);

  const overallState: "operational" | "degraded" | "error" | "loading" =
    healthQuery.isError
      ? "error"
      : !data
        ? "loading"
        : data.status === "operational"
          ? "operational"
          : "degraded";

  return (
    <Shell>
      {/* Header strip */}
      <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Live ops</h1>
            <p className="text-xs text-slate-400">Updates every 5s</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill state={overallState} />
            <span className="text-xs tabular-nums text-slate-500">
              Last updated {formatRelative(lastUpdated, now)}
            </span>
          </div>
        </div>
      </div>

      {healthQuery.isError ? (
        <div className="mb-4 rounded border border-red-800/60 bg-red-950/30 px-3 py-3 text-sm">
          <p className="font-medium text-red-300">
            Could not reach the health endpoint
          </p>
          <p className="mt-1 text-xs text-red-300/80">
            {(healthQuery.error as Error)?.message ?? "Unknown error"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            This is expected in local dev without a Cloudflare Access JWT.
            Polling will continue every 5s.
          </p>
        </div>
      ) : null}

      {/* KPI tiles */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Recent errors (5m)"
          value={data ? data.recent_errors_5min : "—"}
          alert={!!data && data.recent_errors_5min > 0}
        />
        <KpiTile label="Calls (5m)" value={data ? data.recent_calls_5min : "—"} />
        <KpiTile
          label="Signups (24h)"
          value={data ? data.recent_signups_24h : "—"}
        />
        <KpiTile
          label="Active subs"
          value={data ? data.active_subscriptions : "—"}
        />
      </div>

      {/* Component grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {COMPONENT_ORDER.map((name) => (
          <ComponentCard
            key={name}
            name={name}
            component={data?.components[name]}
            history={history[name]}
          />
        ))}
      </div>

      {data ? (
        <p className="mt-3 text-[11px] text-slate-500">
          Total check time: {data.total_check_ms} ms
        </p>
      ) : null}
    </Shell>
  );
}
