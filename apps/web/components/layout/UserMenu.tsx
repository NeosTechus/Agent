"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSession, logout } from "@/lib/auth";

/**
 * Avatar + dropdown with the real user/org name pulled from the session,
 * plus a sign-out action. Falls back to skeleton placeholders while loading
 * and to "Account" / no email if the session call somehow fails.
 */
export function UserMenu() {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const router = useRouter();
  const qc = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
    staleTime: 30_000,
  });

  const logoutMutation = useMutation({
    mutationFn: () => logout(),
    onSettled: () => {
      qc.clear();
      router.push("/login");
    },
  });

  // Close on outside click + Esc.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const session = sessionQuery.data;
  const email = session?.user?.email ?? "";
  const orgName = session?.organization?.name ?? "Account";
  const planTier = session?.organization?.plan_tier ?? null;
  const initials = (
    session?.user?.name
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") ||
    email.slice(0, 1).toUpperCase() ||
    "?"
  );

  return (
    <div ref={containerRef} className="relative flex items-center gap-3">
      <div className="hidden text-right md:block">
        <div className="flex items-center justify-end gap-2">
          <p className="text-sm font-medium text-ink">{orgName}</p>
          {planTier ? <PlanBadge tier={planTier} /> : null}
        </div>
        <p className="text-xs text-ink-muted">{email || "—"}</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-sm font-semibold text-ink-muted transition-colors hover:bg-slate-200"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-30 w-64 overflow-hidden rounded-md border border-border bg-white py-1 text-sm shadow-lg"
        >
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-medium text-ink">{orgName}</p>
              {planTier ? <PlanBadge tier={planTier} /> : null}
            </div>
            <p className="truncate text-xs text-ink-muted">{email}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push("/billing");
            }}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-ink hover:bg-surface"
          >
            <span>Plan &amp; billing</span>
            <span className="text-xs text-ink-muted">{prettyPlan(planTier)}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              router.push("/settings");
            }}
            className="block w-full px-3 py-2 text-left text-ink hover:bg-surface"
          >
            Settings
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            disabled={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
            className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {logoutMutation.isPending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Color-coded pill for the org's current plan tier. */
function PlanBadge({ tier }: { tier: string }) {
  const lower = tier.toLowerCase();
  const styles =
    lower === "pro"
      ? "bg-indigo-100 text-indigo-700"
      : lower === "growth"
      ? "bg-emerald-100 text-emerald-700"
      : lower === "starter"
      ? "bg-sky-100 text-sky-700"
      : "bg-slate-100 text-slate-600";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles}`}
    >
      {prettyPlan(tier)}
    </span>
  );
}

function prettyPlan(tier: string | null): string {
  if (!tier) return "Free";
  const lower = tier.toLowerCase();
  if (lower === "free") return "Free";
  if (lower === "starter") return "Starter";
  if (lower === "growth") return "Growth";
  if (lower === "pro") return "Pro";
  return tier;
}
