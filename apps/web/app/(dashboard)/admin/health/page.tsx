"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  adminApi,
  type HealthComponent,
  type HealthComponentName,
  type HealthResponse,
} from "@/lib/admin";

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
          className="text-slate-300"
        />
      </svg>
    );
  }

  const lastOk = readings[readings.length - 1]?.ok ?? true;
  const stroke = lastOk ? "#10b981" /* emerald-500 */ : "#ef4444" /* red-500 */;

  const values = readings.map((r) => r.latency_ms);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const stepX = readings.length > 1 ? W / (readings.length - 1) : 0;
  const points = readings.map((r, i) => {
    const x = readings.length === 1 ? W / 2 : i * stepX;
    const norm = (r.latency_ms - min) / span;
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
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-muted">
        <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
        Checking…
      </span>
    );
  }
  if (state === "operational") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Operational
      </span>
    );
  }
  if (state === "degraded") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Degraded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
      <span className="h-2 w-2 rounded-full bg-red-500" />
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
      className={`rounded-lg border bg-white px-4 py-3 shadow-sm ${
        alert ? "border-red-300" : "border-border"
      }`}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          alert ? "text-red-600" : "text-ink"
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
      ? "bg-emerald-500"
      : "bg-red-500"
    : "bg-slate-300";
  const latency = component ? `${component.latency_ms} ms` : "—";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${dotColor}`}
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-ink">
            {COMPONENT_LABEL[name]}
          </span>
        </div>
        <span className="text-xs tabular-nums text-ink-muted">{latency}</span>
      </div>
      <Sparkline readings={history} />
      {component?.error ? (
        <p className="truncate text-xs text-red-600" title={component.error}>
          {component.error}
        </p>
      ) : null}
    </div>
  );
}

export default function HealthPage() {
  const [history, setHistory] = React.useState<HistoryMap>(emptyHistory);
  const [lastUpdated, setLastUpdated] = React.useState<number | null>(null);
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

  React.useEffect(() => {
    if (!data) return;
    setHistory((prev) => {
      const next: HistoryMap = { ...prev };
      for (const name of COMPONENT_ORDER) {
        const c = data.components[name];
        if (!c) continue;
        const arr = [
          ...(prev[name] ?? []),
          { latency_ms: c.latency_ms, ok: c.ok },
        ];
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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Live ops</h2>
          <p className="text-xs text-ink-muted">Updates every 5s</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill state={overallState} />
          <span className="text-xs tabular-nums text-ink-muted">
            Last updated {formatRelative(lastUpdated, now)}
          </span>
        </div>
      </div>

      {healthQuery.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm">
          <p className="font-medium text-red-700">
            Could not reach the health endpoint
          </p>
          <p className="mt-1 text-xs text-red-700/80">
            {(healthQuery.error as Error)?.message ?? "Unknown error"}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Polling will continue every 5s.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Recent errors (5m)"
          value={data ? data.recent_errors_5min : "—"}
          alert={!!data && data.recent_errors_5min > 0}
        />
        <KpiTile
          label="Calls (5m)"
          value={data ? data.recent_calls_5min : "—"}
        />
        <KpiTile
          label="Signups (24h)"
          value={data ? data.recent_signups_24h : "—"}
        />
        <KpiTile
          label="Active subs"
          value={data ? data.active_subscriptions : "—"}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <p className="text-[11px] text-ink-muted">
          Total check time: {data.total_check_ms} ms
        </p>
      ) : null}
    </div>
  );
}
