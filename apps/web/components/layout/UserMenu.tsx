/**
 * Stub user menu — no real auth in Phase 1. Replaced with a proper
 * Better Auth-backed dropdown in Phase 2.
 */
export function UserMenu() {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right md:block">
        <p className="text-sm font-medium text-ink">Acme Diner</p>
        <p className="text-xs text-ink-muted">owner@example.com</p>
      </div>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-sm font-semibold text-ink-muted"
      >
        AD
      </span>
    </div>
  );
}
