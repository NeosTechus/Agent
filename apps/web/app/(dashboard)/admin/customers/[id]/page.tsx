"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { adminApi } from "@/lib/admin";

interface CustomerDetail {
  organization: {
    id: string;
    name: string;
    plan_tier: string;
    created_at: number;
  };
  members: Array<{ user_id: string; email: string; role: string }>;
  business: {
    id: string;
    business_name: string;
    vertical: string | null;
  } | null;
  agents: Array<{ id: string; name: string; status: string; version: number }>;
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const detailQuery = useQuery({
    queryKey: ["admin", "customers", id],
    queryFn: () =>
      adminApi.customers.get(id) as unknown as Promise<CustomerDetail>,
  });
  const [reason, setReason] = React.useState("");

  const impersonate = useMutation({
    mutationFn: () => adminApi.impersonate(id, reason),
    onSuccess: (s) => {
      // The impersonation flow opens the dashboard with a session token
      // search-param. Same origin now that admin lives inside the customer
      // app, so a relative path is fine.
      window.open(
        `/dashboard?session_token=${encodeURIComponent(s.session_token)}`,
        "_blank",
      );
    },
  });

  if (detailQuery.isLoading) {
    return <p className="text-sm text-ink-muted">Loading…</p>;
  }
  if (detailQuery.isError) {
    return (
      <p className="text-sm text-red-600">
        {(detailQuery.error as Error).message}
      </p>
    );
  }
  if (!detailQuery.data) return null;
  const detail = detailQuery.data;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-ink">
          {detail.organization.name}
        </h2>
        <p className="text-xs text-ink-muted">
          {detail.organization.plan_tier} · created{" "}
          {new Date(detail.organization.created_at * 1000).toLocaleDateString()}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Impersonate</CardTitle>
        </CardHeader>
        <Textarea
          rows={2}
          placeholder="Reason for impersonation (mandatory)…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-3">
          <Button
            onClick={() => impersonate.mutate()}
            disabled={reason.trim().length < 5 || impersonate.isPending}
          >
            {impersonate.isPending ? "Starting…" : "Start impersonation"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Customer is emailed; session expires in 1 hour.
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
        </CardHeader>
        <ul className="space-y-1 text-sm">
          {detail.members.map((m) => (
            <li key={m.user_id} className="flex justify-between">
              <span className="text-ink">{m.email}</span>
              <span className="text-ink-muted">{m.role}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Business</CardTitle>
        </CardHeader>
        {detail.business ? (
          <p className="text-sm text-ink">
            {detail.business.business_name} ·{" "}
            {detail.business.vertical ?? "—"}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">No business profile yet.</p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agents</CardTitle>
        </CardHeader>
        <ul className="space-y-1 text-sm">
          {detail.agents.map((a) => (
            <li key={a.id} className="flex justify-between">
              <span className="text-ink">{a.name}</span>
              <span className="text-ink-muted">
                {a.status} · v{a.version}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
