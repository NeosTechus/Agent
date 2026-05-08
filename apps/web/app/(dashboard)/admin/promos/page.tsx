"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { adminApi } from "@/lib/admin";

interface PromoRow {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  max_redemptions: number | null;
  redemptions_used: number;
  expires_at: number | null;
  applies_to_plan_tier: string;
}

export default function PromosPage() {
  const qc = useQueryClient();
  const codesQuery = useQuery({
    queryKey: ["admin", "promos"],
    queryFn: () =>
      adminApi.promos.list().then((r) => r.codes as unknown as PromoRow[]),
  });

  const [code, setCode] = React.useState("");
  const [type, setType] = React.useState<"percent" | "fixed">("percent");
  const [value, setValue] = React.useState(10);
  const [tier, setTier] = React.useState<
    "any" | "starter" | "growth" | "pro"
  >("any");
  const [maxRedemptions, setMaxRedemptions] = React.useState<number | "">(100);

  const create = useMutation({
    mutationFn: () =>
      adminApi.promos.create({
        code,
        discount_type: type,
        discount_value: value,
        max_redemptions: maxRedemptions === "" ? null : Number(maxRedemptions),
        applies_to_plan_tier: tier,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "promos"] });
      setCode("");
    },
  });

  const selectClass =
    "flex h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-ink shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-ink">Promo codes</h2>

      <Card>
        <CardHeader>
          <CardTitle>Create new code</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            className="font-mono"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "percent" | "fixed")}
            className={selectClass}
          >
            <option value="percent">Percent</option>
            <option value="fixed">Fixed cents</option>
          </select>
          <Input
            type="number"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
          />
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as typeof tier)}
            className={selectClass}
          >
            <option value="any">Any plan</option>
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="pro">Pro</option>
          </select>
          <Input
            type="number"
            value={maxRedemptions}
            onChange={(e) =>
              setMaxRedemptions(
                e.target.value === "" ? "" : Number(e.target.value),
              )
            }
            placeholder="Max redemptions"
          />
        </div>
        <div className="mt-3">
          <Button
            onClick={() => create.mutate()}
            disabled={!code || create.isPending}
          >
            {create.isPending ? "Creating…" : "Create code"}
          </Button>
        </div>
        {create.isError && (
          <p className="mt-2 text-xs text-red-600">
            {(create.error as Error).message}
          </p>
        )}
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="border-b border-border text-left text-xs uppercase text-ink-muted">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-2 py-3">Discount</th>
              <th className="px-2 py-3">Plan</th>
              <th className="px-4 py-3 text-right">Used / Max</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(codesQuery.data ?? []).map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2 font-mono text-ink">{p.code}</td>
                <td className="px-2 py-2 text-ink">
                  {p.discount_type === "percent"
                    ? `${p.discount_value}%`
                    : `$${(p.discount_value / 100).toFixed(2)}`}
                </td>
                <td className="px-2 py-2 text-ink">{p.applies_to_plan_tier}</td>
                <td className="px-4 py-2 text-right text-ink">
                  {p.redemptions_used} / {p.max_redemptions ?? "∞"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
