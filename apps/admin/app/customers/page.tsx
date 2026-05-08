"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { adminApi } from "@/lib/api";

interface CustomerRow {
  organization_id: string;
  organization_name: string;
  plan_tier: string;
  owner_email: string | null;
  mrr_cents: number;
  call_count_30d: number;
}

export default function CustomersPage() {
  const [filter, setFilter] = React.useState("");
  const customersQuery = useQuery({
    queryKey: ["admin", "customers"],
    queryFn: () => adminApi.customers.list().then((r) => r.customers as unknown as CustomerRow[]),
  });

  const rows = customersQuery.data ?? [];
  const filtered = filter
    ? rows.filter(
        (r) =>
          r.organization_name.toLowerCase().includes(filter.toLowerCase()) ||
          (r.owner_email ?? "").toLowerCase().includes(filter.toLowerCase()),
      )
    : rows;
  const totalMrrCents = filtered.reduce((acc, r) => acc + r.mrr_cents, 0);

  return (
    <Shell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Customers</h1>
          <p className="text-xs text-slate-400">
            {filtered.length} customers · MRR ${(totalMrrCents / 100).toFixed(2)}
          </p>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or email…"
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm placeholder-slate-500"
        />
      </div>
      {customersQuery.isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : customersQuery.isError ? (
        <p className="text-red-400">{(customersQuery.error as Error).message}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-slate-800 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Org</th>
                <th>Owner</th>
                <th>Plan</th>
                <th className="text-right">MRR</th>
                <th className="text-right">Calls (30d)</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {filtered.map((r) => (
                <tr key={r.organization_id} className="hover:bg-slate-900/50">
                  <td className="py-2">{r.organization_name}</td>
                  <td className="text-slate-400">{r.owner_email ?? "—"}</td>
                  <td>{r.plan_tier}</td>
                  <td className="text-right">${(r.mrr_cents / 100).toFixed(0)}</td>
                  <td className="text-right">{r.call_count_30d}</td>
                  <td className="text-right">
                    <Link
                      href={`/customers/${r.organization_id}`}
                      className="text-indigo-400 hover:text-indigo-300"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
