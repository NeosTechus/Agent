"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { adminApi } from "@/lib/admin";

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
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-ink">Audit logs</h2>

      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Input
          value={filters.organization_id}
          onChange={(e) =>
            setFilters((f) => ({ ...f, organization_id: e.target.value }))
          }
          placeholder="organization_id"
          className="font-mono"
        />
        <Input
          value={filters.action}
          onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
          placeholder="action prefix (e.g. admin.)"
        />
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[40rem] text-xs">
          <thead className="border-b border-border text-left uppercase text-ink-muted">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-2 py-3">Action</th>
              <th className="px-2 py-3">Resource</th>
              <th className="px-2 py-3">Org</th>
              <th className="px-2 py-3">User</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border font-mono">
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 text-ink-muted">
                  {new Date(e.created_at * 1000).toLocaleString()}
                </td>
                <td className="px-2 py-2 text-ink">{e.action}</td>
                <td className="px-2 py-2 text-ink">
                  {e.resource_type}/{e.resource_id.slice(0, 12)}…
                </td>
                <td className="px-2 py-2 text-ink-muted">
                  {e.organization_id ?? "—"}
                </td>
                <td className="px-2 py-2 text-ink-muted">
                  {e.user_id ?? "—"}
                </td>
                <td className="px-4 py-2 text-ink-muted">
                  {e.ip_address ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
