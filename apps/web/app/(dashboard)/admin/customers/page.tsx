"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { adminApi } from "@/lib/admin";

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
    queryFn: () =>
      adminApi.customers
        .list()
        .then((r) => r.customers as unknown as CustomerRow[]),
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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Customers</h2>
          <p className="text-xs text-ink-muted">
            {filtered.length} customers · MRR ${(totalMrrCents / 100).toFixed(2)}
          </p>
        </div>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or email…"
          className="sm:w-72"
        />
      </div>

      {customersQuery.isLoading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : customersQuery.isError ? (
        <p className="text-sm text-red-600">
          {(customersQuery.error as Error).message}
        </p>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-3">Org</th>
                <th className="px-2 py-3">Owner</th>
                <th className="px-2 py-3">Plan</th>
                <th className="px-2 py-3 text-right">MRR</th>
                <th className="px-2 py-3 text-right">Calls (30d)</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.organization_id} className="hover:bg-surface">
                  <td className="px-4 py-2 text-ink">{r.organization_name}</td>
                  <td className="px-2 py-2 text-ink-muted">
                    {r.owner_email ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-ink">{r.plan_tier}</td>
                  <td className="px-2 py-2 text-right text-ink">
                    ${(r.mrr_cents / 100).toFixed(0)}
                  </td>
                  <td className="px-2 py-2 text-right text-ink">
                    {r.call_count_30d}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/dashboard/admin/customers/${r.organization_id}`}
                      className="text-primary hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
