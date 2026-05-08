"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { adminApi } from "@/lib/api";

interface AuditEntry {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  before_value: string | null;
  after_value: string | null;
  ip_address: string | null;
  created_at: number;
}

export default function AuditLogsPage() {
  const [filters, setFilters] = React.useState({
    organization_id: "",
    action: "",
  });

  const query = useQuery({
    queryKey: ["admin", "audit-logs", filters],
    queryFn: () => adminApi.auditLogs({ ...filters, limit: 100 }),
  });
  const entries = (query.data?.entries ?? []) as unknown as AuditEntry[];

  return (
    <Shell>
      <h1 className="mb-4 text-xl font-semibold">Audit logs</h1>
      <div className="mb-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <input
          value={filters.organization_id}
          onChange={(e) =>
            setFilters((f) => ({ ...f, organization_id: e.target.value }))
          }
          placeholder="organization_id"
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono"
        />
        <input
          value={filters.action}
          onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
          placeholder="action prefix (e.g. admin.)"
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
        />
      </div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-xs">
        <thead className="border-b border-slate-800 text-left uppercase text-slate-500">
          <tr>
            <th className="py-2">When</th>
            <th>Action</th>
            <th>Resource</th>
            <th>Org</th>
            <th>User</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-900 font-mono">
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="py-1.5 text-slate-400">
                {new Date(e.created_at * 1000).toLocaleString()}
              </td>
              <td>{e.action}</td>
              <td>
                {e.resource_type}/{e.resource_id.slice(0, 12)}…
              </td>
              <td>{e.organization_id ?? "—"}</td>
              <td>{e.user_id ?? "—"}</td>
              <td>{e.ip_address ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </Shell>
  );
}
