"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui";
import { cn } from "@/lib/utils";
import { DASHBOARD_NAV } from "./DashboardSidebar";

interface PaletteItem {
  href: string;
  label: string;
  group: string;
  /** Searchable extra terms — synonyms / shortcuts the label alone won't match. */
  keywords?: string[];
}

const ITEMS: PaletteItem[] = [
  ...DASHBOARD_NAV.map((n) => ({
    href: n.href,
    label: n.label,
    group: "Navigate",
  })),
  // Common deep-links — useful jumps that aren't top-level nav entries.
  {
    href: "/agent",
    label: "Edit agent",
    group: "Actions",
    keywords: ["prompt", "voice", "publish"],
  },
  {
    href: "/billing",
    label: "Manage plan & usage",
    group: "Actions",
    keywords: ["subscription", "minutes", "overage", "stripe"],
  },
  {
    href: "/team",
    label: "Invite teammate",
    group: "Actions",
    keywords: ["member", "user", "invite"],
  },
  {
    href: "/composer",
    label: "Ask the Composer",
    group: "Actions",
    keywords: ["help", "ai", "chat", "assistant"],
  },
];

function score(item: PaletteItem, q: string): number {
  if (!q) return 0;
  const hay = [item.label, ...(item.keywords ?? [])].join(" ").toLowerCase();
  const ql = q.toLowerCase();
  if (hay.startsWith(ql)) return 3;
  if (hay.includes(ql)) return 2;
  // letter-by-letter fuzzy: every char of q must appear in order in hay
  let i = 0;
  for (const ch of hay) {
    if (ch === ql[i]) i++;
    if (i === ql.length) return 1;
  }
  return 0;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);

  const matches = React.useMemo(() => {
    const q = query.trim();
    if (!q) {
      // Empty query → show everything in declared order.
      return ITEMS.map((item) => ({ item, s: 0 }));
    }
    return ITEMS.map((item) => ({ item, s: score(item, q) }))
      .filter((m) => m.s > 0)
      .sort((a, b) => b.s - a.s);
  }, [query]);

  // Reset state on open/close so reopening doesn't show stale query.
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  // Clamp active index when matches shrink.
  React.useEffect(() => {
    if (active >= matches.length) setActive(0);
  }, [active, matches.length]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (matches.length === 0 ? 0 : (i + 1) % matches.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) =>
        matches.length === 0 ? 0 : (i - 1 + matches.length) % matches.length,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = matches[active];
      if (m) go(m.item.href);
    }
  }

  // Group sequential items in the rendered list — render group headers when
  // the group changes between consecutive matches. We rely on the original
  // order so groups stay together when query is empty.
  let lastGroup: string | null = null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="rounded-lg border border-border bg-white shadow-xl">
        <div className="border-b border-border px-3 py-2">
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Jump to… (try 'agent', 'billing', 'invite')"
            className="w-full bg-transparent px-2 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none"
          />
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {matches.length === 0 ? (
            <li className="px-4 py-3 text-sm text-ink-muted">No matches.</li>
          ) : (
            matches.map((m, i) => {
              const showGroup = m.item.group !== lastGroup;
              lastGroup = m.item.group;
              return (
                <React.Fragment key={`${m.item.href}-${i}`}>
                  {showGroup ? (
                    <li className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                      {m.item.group}
                    </li>
                  ) : null}
                  <li>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(m.item.href)}
                      className={cn(
                        "flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors",
                        i === active
                          ? "bg-primary/10 text-primary"
                          : "text-ink hover:bg-surface",
                      )}
                    >
                      <span>{m.item.label}</span>
                      <span className="font-mono text-[11px] text-ink-muted">
                        {m.item.href}
                      </span>
                    </button>
                  </li>
                </React.Fragment>
              );
            })
          )}
        </ul>
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-ink-muted">
          <span>
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px]">
              ↑↓
            </kbd>{" "}
            navigate ·{" "}
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px]">
              ↵
            </kbd>{" "}
            open ·{" "}
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px]">
              esc
            </kbd>{" "}
            close
          </span>
          <span>Agent P</span>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Header trigger button. Opens the palette and listens for ⌘K / Ctrl+K
 * globally — wherever you are in the dashboard, the hotkey works.
 */
export function CommandPaletteTrigger() {
  const [open, setOpen] = React.useState(false);
  const [isMac, setIsMac] = React.useState(false);

  React.useEffect(() => {
    setIsMac(/Mac|iPhone|iPod|iPad/i.test(navigator.platform));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-full max-w-[280px] items-center gap-2 rounded-md border border-border bg-white px-3 text-sm text-ink-muted shadow-sm transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-label="Quick search"
      >
        <SearchIcon />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-muted sm:inline">
          {isMac ? "⌘K" : "Ctrl+K"}
        </kbd>
      </button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
