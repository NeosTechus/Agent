"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Spinner,
} from "@/components/ui";
import {
  ALL_EVENTS,
  createCustomerWebhook,
  deleteCustomerWebhook,
  listCustomerWebhooks,
  updateCustomerWebhook,
  type CustomerWebhook,
  type EventName,
} from "@/lib/customer-webhooks";

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["webhooks-config"],
    queryFn: () => listCustomerWebhooks().then((r) => r.webhooks),
  });

  const [url, setUrl] = React.useState("");
  const [selected, setSelected] = React.useState<Set<EventName>>(
    () => new Set(ALL_EVENTS),
  );
  const [createdSecret, setCreatedSecret] = React.useState<{
    id: string;
    secret: string;
  } | null>(null);

  const createMut = useMutation({
    mutationFn: () => createCustomerWebhook(url, [...selected]),
    onSuccess: ({ webhook }) => {
      qc.invalidateQueries({ queryKey: ["webhooks-config"] });
      setUrl("");
      setCreatedSecret({ id: webhook.id, secret: webhook.secret_token });
      toast.success("Webhook created — copy the secret now.");
    },
    onError: (e) => toast.error((e as Error).message ?? "Create failed"),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "paused" }) =>
      updateCustomerWebhook(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks-config"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCustomerWebhook(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks-config"] });
      toast.success("Webhook removed");
    },
  });

  if (query.isLoading) return <LoadingState title="Loading…" />;
  if (query.isError) {
    return (
      <ErrorState
        title="Could not load integrations"
        description={(query.error as Error)?.message ?? "Try again."}
      />
    );
  }

  const webhooks: CustomerWebhook[] = query.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Integrations</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Push real-time events from your AI receptionist to your own systems via outbound webhooks.
        </p>
      </div>

      <Card className="space-y-4 p-6">
        <h2 className="text-sm font-medium text-ink">Add a webhook endpoint</h2>
        <FormField label="URL">
          <Input
            type="url"
            placeholder="https://yourapp.example.com/hooks/receptionist"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </FormField>
        <div>
          <h3 className="mb-2 text-xs font-medium text-ink-muted">Events</h3>
          <div className="flex flex-wrap gap-2">
            {ALL_EVENTS.map((evt) => {
              const active = selected.has(evt);
              return (
                <button
                  key={evt}
                  type="button"
                  onClick={() => {
                    const next = new Set(selected);
                    if (active) next.delete(evt);
                    else next.add(evt);
                    setSelected(next);
                  }}
                  className={`rounded-md border px-3 py-1 text-xs font-mono ${
                    active
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-slate-300 bg-white text-ink-muted"
                  }`}
                >
                  {evt}
                </button>
              );
            })}
          </div>
        </div>
        <Button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending || !url || selected.size === 0}
        >
          {createMut.isPending ? <Spinner /> : "Add webhook"}
        </Button>

        {createdSecret && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <p className="font-medium text-emerald-900">Save this signing secret now.</p>
            <p className="mt-1 text-xs text-emerald-800">
              We won't show it again. Use it to verify the <code>X-Webhook-Signature</code> header on incoming deliveries (HMAC-SHA256).
            </p>
            <pre className="mt-2 overflow-auto rounded bg-white p-2 font-mono text-xs">
              {createdSecret.secret}
            </pre>
            <button
              onClick={() => navigator.clipboard.writeText(createdSecret.secret)}
              className="mt-2 text-xs text-emerald-700 underline"
            >
              Copy
            </button>
          </div>
        )}
      </Card>

      {webhooks.length === 0 ? (
        <EmptyState
          title="No webhooks yet"
          description="Add an endpoint above to start receiving events."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">URL</th>
                <th className="px-4 py-3 font-medium">Events</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last success</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {webhooks.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50">
                  <td className="max-w-[280px] truncate px-4 py-3 font-mono text-xs">{w.url}</td>
                  <td className="px-4 py-3 text-xs text-ink-muted">
                    {w.events_subscribed.split(",").length} events
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() =>
                        toggleMut.mutate({
                          id: w.id,
                          status: w.status === "active" ? "paused" : "active",
                        })
                      }
                      className={`rounded px-2 py-0.5 text-xs ${
                        w.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {w.status}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted">
                    {w.last_success_at
                      ? new Date(w.last_success_at * 1000).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" onClick={() => deleteMut.mutate(w.id)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}
    </div>
  );
}
