/**
 * Typed TanStack Query key factory. One entry per resource so cache
 * invalidation is grep-friendly and can never silently drift.
 */
export const queryKeys = {
  agents: {
    all: ["agents"] as const,
    list: () => [...queryKeys.agents.all, "list"] as const,
    byId: (id: string) => [...queryKeys.agents.all, "byId", id] as const,
    voices: () => [...queryKeys.agents.all, "voices"] as const,
    versions: (id: string) =>
      [...queryKeys.agents.all, "versions", id] as const,
  },
  calls: {
    all: ["calls"] as const,
    list: (filters: Record<string, unknown> = {}) =>
      [...queryKeys.calls.all, "list", filters] as const,
    byId: (id: string) => [...queryKeys.calls.all, "byId", id] as const,
  },
  kb: {
    all: ["kb"] as const,
    list: (businessId?: string) =>
      [...queryKeys.kb.all, "list", businessId ?? "all"] as const,
  },
  dashboard: {
    all: ["dashboard"] as const,
    today: () => [...queryKeys.dashboard.all, "today"] as const,
    yesterday: () => [...queryKeys.dashboard.all, "yesterday"] as const,
    last7d: () => [...queryKeys.dashboard.all, "last7d"] as const,
    usage: () => [...queryKeys.dashboard.all, "usage"] as const,
    subscription: () =>
      [...queryKeys.dashboard.all, "subscription"] as const,
  },
} as const;
