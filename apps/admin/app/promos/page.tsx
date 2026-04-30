"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { adminApi } from "@/lib/api";

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
    queryFn: () => adminApi.promos.list().then((r) => r.codes as unknown as PromoRow[]),
  });

  const [code, setCode] = React.useState("");
  const [type, setType] = React.useState<"percent" | "fixed">("percent");
  const [value, setValue] = React.useState(10);
  const [tier, setTier] = React.useState<"any" | "starter" | "growth" | "pro">("any");
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

  return (
    <Shell>
      <h1 className="mb-4 text-xl font-semibold">Promo codes</h1>
      <section className="mb-6 rounded border border-slate-800 p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Create new code
        </h2>
        <div className="grid grid-cols-5 gap-2 text-sm">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "percent" | "fixed")}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
          >
            <option value="percent">Percent</option>
            <option value="fixed">Fixed cents</option>
          </select>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
          />
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as typeof tier)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
          >
            <option value="any">Any plan</option>
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="pro">Pro</option>
          </select>
          <input
            type="number"
            value={maxRedemptions}
            onChange={(e) =>
              setMaxRedemptions(e.target.value === "" ? "" : Number(e.target.value))
            }
            placeholder="Max redemptions"
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
          />
        </div>
        <button
          onClick={() => create.mutate()}
          disabled={!code || create.isPending}
          className="mt-3 rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {create.isPending ? "Creating…" : "Create code"}
        </button>
        {create.isError && (
          <p className="mt-2 text-xs text-red-400">{(create.error as Error).message}</p>
        )}
      </section>

      <table className="w-full text-sm">
        <thead className="border-b border-slate-800 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="py-2">Code</th>
            <th>Discount</th>
            <th>Plan</th>
            <th className="text-right">Used / Max</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-900">
          {(codesQuery.data ?? []).map((p) => (
            <tr key={p.id}>
              <td className="py-2 font-mono">{p.code}</td>
              <td>
                {p.discount_type === "percent"
                  ? `${p.discount_value}%`
                  : `$${(p.discount_value / 100).toFixed(2)}`}
              </td>
              <td>{p.applies_to_plan_tier}</td>
              <td className="text-right">
                {p.redemptions_used} / {p.max_redemptions ?? "∞"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}
