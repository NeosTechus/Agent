"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { adminApi } from "@/lib/api";

interface CustomerDetail {
  organization: { id: string; name: string; plan_tier: string; created_at: number };
  members: Array<{ user_id: string; email: string; role: string }>;
  business: { id: string; business_name: string; vertical: string | null } | null;
  agents: Array<{ id: string; name: string; status: string; version: number }>;
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const detailQuery = useQuery({
    queryKey: ["admin", "customers", id],
    queryFn: () => adminApi.customers.get(id) as unknown as Promise<CustomerDetail>,
  });
  const [reason, setReason] = React.useState("");

  const impersonate = useMutation({
    mutationFn: () => adminApi.impersonate(id, reason),
    onSuccess: (s) => {
      const customerAppUrl = process.env.NEXT_PUBLIC_CUSTOMER_APP_URL ?? "http://localhost:3000";
      window.open(
        `${customerAppUrl}/dashboard?session_token=${encodeURIComponent(s.session_token)}`,
        "_blank",
      );
    },
  });

  return (
    <Shell>
      {detailQuery.isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : detailQuery.isError ? (
        <p className="text-red-400">{(detailQuery.error as Error).message}</p>
      ) : detailQuery.data ? (
        <div className="space-y-6">
          <header>
            <h1 className="text-xl font-semibold">{detailQuery.data.organization.name}</h1>
            <p className="text-xs text-slate-400">
              {detailQuery.data.organization.plan_tier} · created{" "}
              {new Date(detailQuery.data.organization.created_at * 1000).toLocaleDateString()}
            </p>
          </header>

          <section className="rounded border border-slate-800 p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Impersonate
            </h2>
            <textarea
              rows={2}
              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              placeholder="Reason for impersonation (mandatory)…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              onClick={() => impersonate.mutate()}
              disabled={reason.trim().length < 5 || impersonate.isPending}
              className="mt-2 rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {impersonate.isPending ? "Starting…" : "Start impersonation"}
            </button>
            <p className="mt-2 text-xs text-slate-500">
              Customer is emailed; session expires in 1 hour.
            </p>
          </section>

          <section className="rounded border border-slate-800 p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Team
            </h2>
            <ul className="space-y-1 text-sm">
              {detailQuery.data.members.map((m) => (
                <li key={m.user_id} className="flex justify-between">
                  <span>{m.email}</span>
                  <span className="text-slate-400">{m.role}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded border border-slate-800 p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Business
            </h2>
            {detailQuery.data.business ? (
              <p className="text-sm">
                {detailQuery.data.business.business_name} · {detailQuery.data.business.vertical ?? "—"}
              </p>
            ) : (
              <p className="text-sm text-slate-500">No business profile yet.</p>
            )}
          </section>

          <section className="rounded border border-slate-800 p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Agents
            </h2>
            <ul className="space-y-1 text-sm">
              {detailQuery.data.agents.map((a) => (
                <li key={a.id} className="flex justify-between">
                  <span>{a.name}</span>
                  <span className="text-slate-400">
                    {a.status} · v{a.version}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </Shell>
  );
}
