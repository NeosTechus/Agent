// Integration test harness — builds a Hono app with in-memory D1 + KV
// stand-ins so we can call `app.fetch(req)` without a Workers runtime.
//
// **Scope deliberately tight**: this harness is enough for auth + billing
// happy/error paths. Anything that needs D1's real query planner (CTEs,
// JSON1, FTS5) is out of scope — write those as `.todo` until the QA Agent
// wires real Workers test bindings (Phase 3 task).
//
// The D1 stand-in implements the small subset of the
// `D1Database` interface our service code actually uses:
//   - `prepare(sql).bind(...).first<T>()`
//   - `prepare(sql).bind(...).run()`
//   - `batch([stmt, ...])`
//
// Storage is a JS Map keyed by table name. SQL strings are parsed with
// regex — fragile, but fine for the deterministic queries our handlers
// emit. The harness throws "TODO(test-infra)" on any unrecognized query so
// future writes show up loudly instead of silently no-oping.

import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { AppEnv, Variables } from '../../apps/api/src/types';
import type { Bindings } from '../../apps/api/src/env';
import { cors } from '../../apps/api/src/middleware/cors';
import { errorHandler } from '../../apps/api/src/middleware/error-handler';
import { requestId } from '../../apps/api/src/middleware/request-id';
import { requestLogger } from '../../apps/api/src/middleware/logger';
import { rateLimit } from '../../apps/api/src/middleware/rate-limit';
import { globalAuthMiddleware } from '../../apps/api/src/middleware/auth';
import { routes } from '../../apps/api/src/routes';

// ---------------------------------------------------------------------------
// In-memory KV
// ---------------------------------------------------------------------------
export interface MemKV {
  store: Map<string, { value: string; expiresAt: number | null }>;
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    opts?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createMemKV(): MemKV {
  const store = new Map<string, { value: string; expiresAt: number | null }>();
  return {
    store,
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key, value, opts) {
      const expiresAt =
        opts?.expirationTtl !== undefined
          ? Date.now() + opts.expirationTtl * 1000
          : null;
      store.set(key, { value, expiresAt });
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory D1 stand-in
// ---------------------------------------------------------------------------
export interface MemD1Tables {
  users: Map<string, Record<string, unknown>>;
  organizations: Map<string, Record<string, unknown>>;
  organization_members: Map<string, Record<string, unknown>>;
  subscriptions: Map<string, Record<string, unknown>>;
  businesses: Map<string, Record<string, unknown>>;
  webhooks: Map<string, Record<string, unknown>>;
  webhook_deliveries: Map<string, Record<string, unknown>>;
  organization_invitations: Map<string, Record<string, unknown>>;
  audit_logs: Map<string, Record<string, unknown>>;
  agents: Map<string, Record<string, unknown>>;
}

/**
 * Shape returned by the harness — structurally compatible with `D1Database`
 * for the surface our handlers exercise (`prepare`, `batch`), plus a
 * `tables` escape-hatch for tests that want to seed / inspect rows.
 *
 * Intentionally NOT `extends D1Database` to avoid implementing every
 * private method on the real interface — we cast through `unknown` at the
 * binding boundary.
 */
export interface MemD1 {
  tables: MemD1Tables;
  prepare: D1Database['prepare'];
  batch: D1Database['batch'];
  dump: D1Database['dump'];
  exec: D1Database['exec'];
  withSession: D1Database['withSession'];
}

interface PreparedStmt {
  sql: string;
  args: unknown[];
}

function makeStmt(sql: string, tables: MemD1Tables): unknown {
  const stmt: PreparedStmt = { sql: sql.trim(), args: [] };
  const api = {
    bind(...args: unknown[]) {
      stmt.args = args;
      return api;
    },
    async first<T = unknown>(): Promise<T | null> {
      return execFirst<T>(stmt, tables);
    },
    async run() {
      return execRun(stmt, tables);
    },
    /** Drizzle's D1 driver calls `.raw()` to read tuple-array rows. We
     * delegate to `execAll` and shape each row as a value tuple in the
     * declared column order — Drizzle then maps it back. For the limited
     * Drizzle queries the auth/billing tests exercise, returning the row
     * object's values is sufficient. */
    async raw<T = unknown>(): Promise<T[]> {
      const rows = execAll<Record<string, unknown>>(stmt, tables);
      return rows.map((r) => Object.values(r)) as T[];
    },
    async all<T = unknown>(): Promise<{ results: T[] }> {
      const r = execAll<T>(stmt, tables);
      return { results: r };
    },
  };
  return api;
}

export function createMemD1(): MemD1 {
  const tables: MemD1Tables = {
    users: new Map(),
    organizations: new Map(),
    organization_members: new Map(),
    subscriptions: new Map(),
    businesses: new Map(),
    webhooks: new Map(),
    webhook_deliveries: new Map(),
    organization_invitations: new Map(),
    audit_logs: new Map(),
    agents: new Map(),
  };

  const db = {
    tables,
    prepare(sql: string) {
      return makeStmt(sql, tables) as ReturnType<D1Database['prepare']>;
    },
    async batch<T = unknown>(stmts: Array<ReturnType<D1Database['prepare']>>) {
      const out: Array<{ results: T[]; success: boolean }> = [];
      for (const s of stmts) {
        // The bind chain returned the API object above; call run.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (s as any).run();
        out.push({ results: [], success: true });
      }
      return out as unknown as D1Result<T>[];
    },
    async dump(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0);
    },
    async exec() {
      return { count: 0, duration: 0 };
    },
    async withSession() {
      throw new Error('not implemented');
    },
  } as unknown as MemD1;

  return db;
}

// ---------------------------------------------------------------------------
// SQL "parser" — recognizes only the queries our handlers emit. Anything
// else throws so we don't silently drop writes.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function execFirst<T>(stmt: PreparedStmt, tables: MemD1Tables): T | null {
  const sql = stmt.sql.replace(/\s+/g, ' ').trim();

  // SELECT id FROM users WHERE email = ? LIMIT 1
  if (/^SELECT id FROM users WHERE email = \? LIMIT 1$/i.test(sql)) {
    const [email] = stmt.args as [string];
    for (const u of tables.users.values()) {
      if (u.email === email) return { id: u.id } as T;
    }
    return null;
  }

  // SELECT u.id..., m.organization_id, m.role FROM users u JOIN organization_members m ... WHERE u.email = ?
  if (/^SELECT u\.id AS user_id.*FROM users u JOIN organization_members m/i.test(sql)) {
    const [email] = stmt.args as [string];
    for (const u of tables.users.values()) {
      if (u.email !== email) continue;
      for (const m of tables.organization_members.values()) {
        if (m.user_id === u.id) {
          return {
            user_id: u.id,
            password_hash: u.password_hash,
            organization_id: m.organization_id,
            role: m.role,
          } as T;
        }
      }
      return null;
    }
    return null;
  }

  // SELECT id, email_verification_expires FROM users WHERE email_verification_token = ?
  if (/^SELECT id, email_verification_expires FROM users WHERE email_verification_token = \?/i.test(sql)) {
    const [tok] = stmt.args as [string];
    for (const u of tables.users.values()) {
      if (u.email_verification_token === tok) {
        return { id: u.id, email_verification_expires: u.email_verification_expires } as T;
      }
    }
    return null;
  }

  // SELECT id, password_reset_expires FROM users WHERE password_reset_token = ?
  if (/^SELECT id, password_reset_expires FROM users WHERE password_reset_token = \?/i.test(sql)) {
    const [tok] = stmt.args as [string];
    for (const u of tables.users.values()) {
      if (u.password_reset_token === tok) {
        return { id: u.id, password_reset_expires: u.password_reset_expires } as T;
      }
    }
    return null;
  }

  // SELECT id FROM users WHERE email = ? LIMIT 1 (alternate spacing already covered above)

  // SELECT u.id, u.email,... loadSessionContext
  if (/SELECT u\.id AS u_id.*FROM users u JOIN organization_members m/i.test(sql)) {
    const [orgId, userId] = stmt.args as [string, string];
    const u = tables.users.get(userId as string);
    if (!u) return null;
    let role: string | null = null;
    for (const m of tables.organization_members.values()) {
      if (m.user_id === userId && m.organization_id === orgId) {
        role = m.role as string;
        break;
      }
    }
    if (!role) return null;
    const o = tables.organizations.get(orgId as string);
    if (!o) return null;
    return {
      u_id: u.id,
      u_email: u.email,
      u_name: u.name ?? null,
      u_verified: u.email_verified_at ?? null,
      o_id: o.id,
      o_name: o.name,
      o_plan: o.plan_tier,
      m_role: role,
    } as T;
  }

  // SELECT plan_tier, status,... FROM subscriptions
  if (/^SELECT plan_tier, status.*FROM subscriptions WHERE organization_id = \?/i.test(sql)) {
    const [orgId] = stmt.args as [string];
    let latest: Row | null = null;
    for (const s of tables.subscriptions.values()) {
      if (s.organization_id === orgId) {
        if (!latest || (s.created_at as number) > (latest.created_at as number)) {
          latest = s;
        }
      }
    }
    if (!latest) return null;
    return {
      plan_tier: latest.plan_tier,
      status: latest.status,
      current_period_start: latest.current_period_start ?? null,
      current_period_end: latest.current_period_end ?? null,
      cancel_at_period_end: latest.cancel_at_period_end ?? 0,
      stripe_subscription_id: latest.stripe_subscription_id ?? null,
    } as T;
  }

  // SELECT stripe_customer_id FROM organizations WHERE id = ?
  if (/^SELECT stripe_customer_id FROM organizations WHERE id = \? LIMIT 1$/i.test(sql)) {
    const [orgId] = stmt.args as [string];
    const o = tables.organizations.get(orgId);
    if (!o) return null;
    return { stripe_customer_id: o.stripe_customer_id ?? null } as T;
  }

  // ===== Customer webhooks (services/webhooks) =====
  if (/^SELECT COUNT\(\*\) AS n FROM webhooks WHERE organization_id = \? AND deleted_at IS NULL$/i.test(sql)) {
    const [orgId] = stmt.args as [string];
    let n = 0;
    for (const w of tables.webhooks.values()) {
      if (w.organization_id === orgId && !w.deleted_at) n++;
    }
    return { n } as T;
  }
  if (/^SELECT id, organization_id, url, events_subscribed, secret_token,.*FROM webhooks WHERE id = \?$/i.test(sql)) {
    const [id] = stmt.args as [string];
    return (tables.webhooks.get(id) ?? null) as T;
  }
  if (/^SELECT id FROM webhooks WHERE id = \? AND organization_id = \? AND deleted_at IS NULL$/i.test(sql)) {
    const [id, orgId] = stmt.args as [string, string];
    const w = tables.webhooks.get(id);
    if (w && w.organization_id === orgId && !w.deleted_at) return { id: w.id } as T;
    return null;
  }

  // ===== Team / invitations =====
  if (/^SELECT u\.id FROM users u JOIN organization_members m ON m\.user_id = u\.id WHERE m\.organization_id = \? AND u\.email = \?$/i.test(sql)) {
    const [orgId, email] = stmt.args as [string, string];
    for (const u of tables.users.values()) {
      if (u.email !== email) continue;
      for (const m of tables.organization_members.values()) {
        if (m.user_id === u.id && m.organization_id === orgId) {
          return { id: u.id } as T;
        }
      }
    }
    return null;
  }
  if (/^SELECT id, organization_id, email, role, expires_at, accepted_at FROM organization_invitations WHERE token_hash = \?$/i.test(sql)) {
    const [tokenHash] = stmt.args as [string];
    for (const inv of tables.organization_invitations.values()) {
      if (inv.token_hash === tokenHash) {
        return {
          id: inv.id,
          organization_id: inv.organization_id,
          email: inv.email,
          role: inv.role,
          expires_at: inv.expires_at,
          accepted_at: inv.accepted_at ?? null,
        } as T;
      }
    }
    return null;
  }
  if (/^SELECT id FROM users WHERE email = \?$/i.test(sql)) {
    const [email] = stmt.args as [string];
    for (const u of tables.users.values()) {
      if (u.email === email) return { id: u.id } as T;
    }
    return null;
  }
  if (/^SELECT role FROM organization_members WHERE organization_id = \? AND user_id = \?$/i.test(sql)) {
    const [orgId, userId] = stmt.args as [string, string];
    for (const m of tables.organization_members.values()) {
      if (m.organization_id === orgId && m.user_id === userId) return { role: m.role } as T;
    }
    return null;
  }
  if (/^SELECT COUNT\(\*\) AS n FROM organization_members WHERE organization_id = \? AND role = 'owner'$/i.test(sql)) {
    const [orgId] = stmt.args as [string];
    let n = 0;
    for (const m of tables.organization_members.values()) {
      if (m.organization_id === orgId && m.role === "owner") n++;
    }
    return { n } as T;
  }

  // ===== Account deletion =====
  if (/^SELECT deletion_requested_at, deletion_scheduled_at FROM organizations WHERE id = \?$/i.test(sql)) {
    const [orgId] = stmt.args as [string];
    const o = tables.organizations.get(orgId);
    if (!o) return null;
    return {
      deletion_requested_at: o.deletion_requested_at ?? null,
      deletion_scheduled_at: o.deletion_scheduled_at ?? null,
    } as T;
  }

  // ===== Onboarding / businesses =====
  if (/^SELECT id FROM businesses WHERE organization_id = \? AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1$/i.test(sql)) {
    const [orgId] = stmt.args as [string];
    const matches: Row[] = [];
    for (const b of tables.businesses.values()) {
      if (b.organization_id === orgId && !b.deleted_at) matches.push(b);
    }
    matches.sort((a, b) => (a.created_at as number) - (b.created_at as number));
    return (matches[0] ? { id: matches[0].id } : null) as T;
  }
  if (/^SELECT id, organization_id, business_name, vertical, address, hours_json, existing_phone_number, twilio_forwarding_number, vapi_phone_number_id FROM businesses WHERE/i.test(sql)) {
    const [businessId, orgId] = stmt.args as [string, string];
    const b = tables.businesses.get(businessId);
    if (!b || b.organization_id !== orgId || b.deleted_at) return null;
    return {
      id: b.id,
      organization_id: b.organization_id,
      business_name: b.business_name,
      vertical: b.vertical ?? null,
      address: b.address ?? null,
      hours_json: b.hours_json ?? null,
      existing_phone_number: b.existing_phone_number ?? null,
      twilio_forwarding_number: b.twilio_forwarding_number ?? null,
      vapi_phone_number_id: b.vapi_phone_number_id ?? null,
    } as T;
  }
  if (/^SELECT id, organization_id, business_name, vertical, address, hours_json, existing_phone_number, twilio_forwarding_number, vapi_phone_number_id FROM businesses WHERE organization_id = \? AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1$/i.test(sql)) {
    const [orgId] = stmt.args as [string];
    const matches: Row[] = [];
    for (const b of tables.businesses.values()) {
      if (b.organization_id === orgId && !b.deleted_at) matches.push(b);
    }
    matches.sort((a, b) => (a.created_at as number) - (b.created_at as number));
    return (matches[0] ?? null) as T;
  }
  if (/^SELECT forwarding_probe_call_id, forwarding_probe_started_at, forwarding_verified_at, vapi_phone_number_id FROM businesses WHERE id = \? AND organization_id = \?$/i.test(sql)) {
    const [businessId, orgId] = stmt.args as [string, string];
    const b = tables.businesses.get(businessId);
    if (!b || b.organization_id !== orgId) return null;
    return {
      forwarding_probe_call_id: b.forwarding_probe_call_id ?? null,
      forwarding_probe_started_at: b.forwarding_probe_started_at ?? null,
      forwarding_verified_at: b.forwarding_verified_at ?? null,
      vapi_phone_number_id: b.vapi_phone_number_id ?? null,
    } as T;
  }
  if (/^SELECT id, vapi_assistant_id FROM agents WHERE organization_id = \? AND business_id = \? AND deleted_at IS NULL/i.test(sql)) {
    const [orgId, businessId] = stmt.args as [string, string];
    for (const a of tables.agents.values()) {
      if (a.organization_id === orgId && a.business_id === businessId && !a.deleted_at) {
        return { id: a.id, vapi_assistant_id: a.vapi_assistant_id ?? null } as T;
      }
    }
    return null;
  }

  throw new Error(`TODO(test-infra): unrecognized SELECT: ${sql}`);
}

function execAll<T>(stmt: PreparedStmt, tables: MemD1Tables): T[] {
  const sql = stmt.sql.replace(/\s+/g, ' ').trim();
  // Drizzle-emitted user-by-email lookup. Both the bare and quoted forms:
  //   - `select id from users where email = ? limit ?`
  //   - `select "id" from "users" where "users"."email" = ? limit ?`
  if (/select\s+"?id"?\s+from\s+"?users"?\s+where\s+(?:"users"\.)?"?email"?\s+=\s+\?/i.test(sql)) {
    const [email] = stmt.args as [string];
    const out: Row[] = [];
    for (const u of tables.users.values()) {
      if (u.email === email) out.push({ id: u.id });
    }
    return out as T[];
  }

  // ===== Customer webhooks (list) =====
  if (/^SELECT id, organization_id, url, events_subscribed, secret_token,.*FROM webhooks WHERE organization_id = \? AND deleted_at IS NULL ORDER BY created_at DESC$/i.test(sql)) {
    const [orgId] = stmt.args as [string];
    const out: Row[] = [];
    for (const w of tables.webhooks.values()) {
      if (w.organization_id === orgId && !w.deleted_at) out.push({ ...w });
    }
    out.sort((a, b) => (b.created_at as number) - (a.created_at as number));
    return out as T[];
  }
  if (/^SELECT id, events_subscribed FROM webhooks WHERE organization_id = \? AND status = 'active' AND deleted_at IS NULL$/i.test(sql)) {
    const [orgId] = stmt.args as [string];
    const out: Row[] = [];
    for (const w of tables.webhooks.values()) {
      if (w.organization_id === orgId && w.status === "active" && !w.deleted_at) {
        out.push({ id: w.id, events_subscribed: w.events_subscribed });
      }
    }
    return out as T[];
  }

  // ===== Team =====
  if (/^SELECT m\.id, m\.user_id, m\.role, u\.email, u\.name, m\.accepted_at, m\.invited_at FROM organization_members m JOIN users u ON u\.id = m\.user_id WHERE m\.organization_id = \? ORDER BY/i.test(sql)) {
    const [orgId] = stmt.args as [string];
    const out: Row[] = [];
    for (const m of tables.organization_members.values()) {
      if (m.organization_id !== orgId) continue;
      const u = tables.users.get(m.user_id as string);
      if (!u) continue;
      out.push({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        email: u.email,
        name: u.name ?? null,
        accepted_at: m.accepted_at ?? null,
        invited_at: m.invited_at,
      });
    }
    out.sort((a, b) => {
      const aOwner = a.role === "owner" ? 1 : 0;
      const bOwner = b.role === "owner" ? 1 : 0;
      if (aOwner !== bOwner) return bOwner - aOwner;
      return (a.email as string).localeCompare(b.email as string);
    });
    return out as T[];
  }
  if (/^SELECT id, email, role, created_at AS invited_at, expires_at, accepted_at FROM organization_invitations WHERE organization_id = \? ORDER BY created_at DESC$/i.test(sql)) {
    const [orgId] = stmt.args as [string];
    const out: Row[] = [];
    for (const inv of tables.organization_invitations.values()) {
      if (inv.organization_id === orgId) {
        out.push({
          id: inv.id,
          email: inv.email,
          role: inv.role,
          invited_at: inv.created_at,
          expires_at: inv.expires_at,
          accepted_at: inv.accepted_at ?? null,
        });
      }
    }
    out.sort((a, b) => (b.invited_at as number) - (a.invited_at as number));
    return out as T[];
  }

  // ===== Account deletion sweeper =====
  if (/^SELECT id FROM organizations WHERE deletion_scheduled_at IS NOT NULL AND deletion_scheduled_at <= \? AND deleted_at IS NULL$/i.test(sql)) {
    const [cutoff] = stmt.args as [number];
    const out: Row[] = [];
    for (const o of tables.organizations.values()) {
      if (o.deletion_scheduled_at && (o.deletion_scheduled_at as number) <= cutoff && !o.deleted_at) {
        out.push({ id: o.id });
      }
    }
    return out as T[];
  }

  throw new Error(`TODO(test-infra): unrecognized SELECT-many: ${sql}`);
}

function execRun(stmt: PreparedStmt, tables: MemD1Tables): { success: true } {
  const sql = stmt.sql.replace(/\s+/g, ' ').trim();

  // Team-invite-acceptance INSERT (7 args) — must match BEFORE the generic
  // signup INSERT below or the generic regex would swallow it.
  if (/^INSERT INTO users \(id, email, name, password_hash, email_verified_at, created_at, updated_at\)/i.test(sql)) {
    const [id, email, name, passwordHash, emailVerifiedAt, createdAt, updatedAt] = stmt.args as [
      string, string, string | null, string, number, number, number,
    ];
    tables.users.set(id, {
      id,
      email,
      name,
      credits_remaining: 0,
      password_hash: passwordHash,
      email_verification_token: null,
      email_verification_expires: null,
      email_verified_at: emailVerifiedAt,
      password_reset_token: null,
      password_reset_expires: null,
      created_at: createdAt,
      updated_at: updatedAt,
    });
    return { success: true };
  }

  if (/^INSERT INTO users \(/i.test(sql)) {
    const [
      id,
      email,
      name,
      passwordHash,
      verificationToken,
      verificationExpires,
      createdAt,
      updatedAt,
    ] = stmt.args as [
      string,
      string,
      string | null,
      string,
      string,
      number,
      number,
      number,
    ];
    tables.users.set(id, {
      id,
      email,
      name,
      credits_remaining: 0,
      password_hash: passwordHash,
      email_verification_token: verificationToken,
      email_verification_expires: verificationExpires,
      email_verified_at: null,
      password_reset_token: null,
      password_reset_expires: null,
      created_at: createdAt,
      updated_at: updatedAt,
    });
    return { success: true };
  }

  if (/^INSERT INTO organizations \(/i.test(sql)) {
    const [id, name, ownerUserId, createdAt, updatedAt] = stmt.args as [
      string,
      string,
      string,
      number,
      number,
    ];
    tables.organizations.set(id, {
      id,
      name,
      owner_user_id: ownerUserId,
      plan_tier: 'free',
      location_count: 1,
      stripe_customer_id: null,
      created_at: createdAt,
      updated_at: updatedAt,
    });
    return { success: true };
  }

  if (/^INSERT INTO organization_members \(/i.test(sql)) {
    const [id, organizationId, userId, invitedAt, acceptedAt, createdAt, updatedAt] =
      stmt.args as [string, string, string, number, number, number, number];
    tables.organization_members.set(id, {
      id,
      organization_id: organizationId,
      user_id: userId,
      role: 'owner',
      invited_at: invitedAt,
      accepted_at: acceptedAt,
      created_at: createdAt,
      updated_at: updatedAt,
    });
    return { success: true };
  }

  if (/^UPDATE users SET email_verified_at = \?,/i.test(sql)) {
    const [verifiedAt, updatedAt, id] = stmt.args as [number, number, string];
    const u = tables.users.get(id);
    if (u) {
      u.email_verified_at = verifiedAt;
      u.email_verification_token = null;
      u.email_verification_expires = null;
      u.updated_at = updatedAt;
    }
    return { success: true };
  }

  if (/^UPDATE users SET password_reset_token = \?,/i.test(sql)) {
    const [tok, expires, updatedAt, id] = stmt.args as [string, number, number, string];
    const u = tables.users.get(id);
    if (u) {
      u.password_reset_token = tok;
      u.password_reset_expires = expires;
      u.updated_at = updatedAt;
    }
    return { success: true };
  }

  if (/^UPDATE users SET password_hash = \?,/i.test(sql)) {
    const [hash, updatedAt, id] = stmt.args as [string, number, string];
    const u = tables.users.get(id);
    if (u) {
      u.password_hash = hash;
      u.password_reset_token = null;
      u.password_reset_expires = null;
      u.updated_at = updatedAt;
    }
    return { success: true };
  }

  if (/^INSERT INTO subscriptions \(/i.test(sql)) {
    const [
      id,
      organizationId,
      stripeSubscriptionId,
      planTier,
      status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      createdAt,
      updatedAt,
    ] = stmt.args as [
      string,
      string,
      string,
      string,
      string,
      number | null,
      number | null,
      number,
      number,
      number,
    ];
    // Upsert by stripe_subscription_id.
    let existing: Row | null = null;
    for (const s of tables.subscriptions.values()) {
      if (s.stripe_subscription_id === stripeSubscriptionId) {
        existing = s;
        break;
      }
    }
    if (existing) {
      existing.plan_tier = planTier;
      existing.status = status;
      existing.current_period_start = currentPeriodStart;
      existing.current_period_end = currentPeriodEnd;
      existing.cancel_at_period_end = cancelAtPeriodEnd;
      existing.updated_at = updatedAt;
    } else {
      tables.subscriptions.set(id, {
        id,
        organization_id: organizationId,
        stripe_subscription_id: stripeSubscriptionId,
        plan_tier: planTier,
        status,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: cancelAtPeriodEnd,
        created_at: createdAt,
        updated_at: updatedAt,
      });
    }
    return { success: true };
  }

  if (/^UPDATE subscriptions SET status = \?, updated_at = \? WHERE stripe_subscription_id = \?/i.test(sql)) {
    const [status, updatedAt, stripeSubId] = stmt.args as [string, number, string];
    for (const s of tables.subscriptions.values()) {
      if (s.stripe_subscription_id === stripeSubId) {
        s.status = status;
        s.updated_at = updatedAt;
      }
    }
    return { success: true };
  }

  // ===== Customer webhooks =====
  if (/^INSERT INTO webhooks \(/i.test(sql)) {
    const [id, orgId, url, eventsSubscribed, secretToken, , , status, createdAt, updatedAt] =
      stmt.args as [
        string, string, string, string, string,
        unknown, unknown, string, number, number,
      ];
    tables.webhooks.set(id, {
      id,
      organization_id: orgId,
      url,
      events_subscribed: eventsSubscribed,
      secret_token: secretToken,
      last_success_at: null,
      last_failure_at: null,
      status: status ?? "active",
      deleted_at: null,
      created_at: createdAt,
      updated_at: updatedAt,
    });
    return { success: true };
  }
  if (/^UPDATE webhooks SET .+ WHERE id = \? AND organization_id = \?$/i.test(sql)) {
    // Generic patch — last two args are id + orgId; everything before is set-pairs.
    const args = stmt.args as unknown[];
    const [id, orgId] = args.slice(-2) as [string, string];
    const w = tables.webhooks.get(id);
    if (!w || w.organization_id !== orgId) return { success: true };
    // Parse the SET clause for column names in order.
    const setMatch = sql.match(/SET (.+?) WHERE/i);
    if (setMatch?.[1]) {
      const cols = setMatch[1]
        .split(",")
        .map((s) => s.trim().split("=")[0]?.trim())
        .filter((c): c is string => Boolean(c));
      cols.forEach((col, i) => {
        w[col] = args[i];
      });
    }
    return { success: true };
  }

  // ===== Team / invitations =====
  if (/^INSERT INTO organization_invitations \(/i.test(sql)) {
    const [id, orgId, email, role, invitedBy, tokenHash, expiresAt, , createdAt, updatedAt] =
      stmt.args as [string, string, string, string, string, string, number, unknown, number, number];
    tables.organization_invitations.set(id, {
      id,
      organization_id: orgId,
      email,
      role,
      invited_by_user_id: invitedBy,
      token_hash: tokenHash,
      expires_at: expiresAt,
      accepted_at: null,
      created_at: createdAt,
      updated_at: updatedAt,
    });
    return { success: true };
  }
  if (/^UPDATE organization_invitations SET accepted_at = \?, updated_at = \? WHERE id = \?$/i.test(sql)) {
    const [acceptedAt, updatedAt, id] = stmt.args as [number, number, string];
    const inv = tables.organization_invitations.get(id);
    if (inv) {
      inv.accepted_at = acceptedAt;
      inv.updated_at = updatedAt;
    }
    return { success: true };
  }
  if (/^INSERT INTO organization_members \(.+\) VALUES \(.+\) ON CONFLICT/i.test(sql)) {
    const [memberId, orgId, userId, role, invitedAt, acceptedAt, createdAt, updatedAt] =
      stmt.args as [string, string, string, string, number, number, number, number];
    // Look for existing membership.
    for (const m of tables.organization_members.values()) {
      if (m.organization_id === orgId && m.user_id === userId) {
        m.role = role;
        m.accepted_at = acceptedAt;
        m.updated_at = updatedAt;
        return { success: true };
      }
    }
    tables.organization_members.set(memberId, {
      id: memberId,
      organization_id: orgId,
      user_id: userId,
      role,
      invited_at: invitedAt,
      accepted_at: acceptedAt,
      created_at: createdAt,
      updated_at: updatedAt,
    });
    return { success: true };
  }
  // (Team-invite INSERT INTO users moved earlier to take precedence over the
  // generic signup INSERT recognizer — see top of execRun.)
  if (/^DELETE FROM organization_members WHERE organization_id = \? AND user_id = \?$/i.test(sql)) {
    const [orgId, userId] = stmt.args as [string, string];
    for (const [k, m] of tables.organization_members.entries()) {
      if (m.organization_id === orgId && m.user_id === userId) {
        tables.organization_members.delete(k);
      }
    }
    return { success: true };
  }
  if (/^UPDATE organization_members SET role = \?, updated_at = \? WHERE organization_id = \? AND user_id = \? AND role != 'owner'$/i.test(sql)) {
    const [role, updatedAt, orgId, userId] = stmt.args as [string, number, string, string];
    for (const m of tables.organization_members.values()) {
      if (m.organization_id === orgId && m.user_id === userId && m.role !== "owner") {
        m.role = role;
        m.updated_at = updatedAt;
      }
    }
    return { success: true };
  }

  // ===== Account deletion =====
  if (/^UPDATE organizations SET deletion_requested_at = \?, deletion_scheduled_at = \?, deletion_requested_by_user_id = \?, updated_at = \? WHERE id = \?$/i.test(sql)) {
    const [requestedAt, scheduledAt, byUserId, updatedAt, id] = stmt.args as [
      number, number, string, number, string,
    ];
    const o = tables.organizations.get(id);
    if (o) {
      o.deletion_requested_at = requestedAt;
      o.deletion_scheduled_at = scheduledAt;
      o.deletion_requested_by_user_id = byUserId;
      o.updated_at = updatedAt;
    }
    return { success: true };
  }
  if (/^UPDATE organizations SET deletion_requested_at = NULL, deletion_scheduled_at = NULL, deletion_requested_by_user_id = NULL, updated_at = \? WHERE id = \?$/i.test(sql)) {
    const [updatedAt, id] = stmt.args as [number, string];
    const o = tables.organizations.get(id);
    if (o) {
      o.deletion_requested_at = null;
      o.deletion_scheduled_at = null;
      o.deletion_requested_by_user_id = null;
      o.updated_at = updatedAt;
    }
    return { success: true };
  }
  if (/^UPDATE organizations SET deleted_at = \? WHERE id = \?$/i.test(sql)) {
    const [deletedAt, id] = stmt.args as [number, string];
    const o = tables.organizations.get(id);
    if (o) o.deleted_at = deletedAt;
    return { success: true };
  }
  if (/^UPDATE (?:businesses|agents|knowledge_base_documents|webhooks|calls) SET deleted_at = \? WHERE organization_id = \?$/i.test(sql)) {
    // Cascade soft-delete from the deletion sweeper. We accept any of the five
    // tables and soft-delete matching rows in the org-keyed stores we track.
    const [deletedAt, orgId] = stmt.args as [number, string];
    const tableMatch = sql.match(/UPDATE (\w+)/);
    const tableName = tableMatch?.[1] as keyof MemD1Tables | undefined;
    if (tableName && tables[tableName]) {
      for (const r of (tables[tableName] as Map<string, Row>).values()) {
        if (r.organization_id === orgId) r.deleted_at = deletedAt;
      }
    }
    return { success: true };
  }

  // ===== Audit logs (append-only) =====
  if (/^INSERT INTO audit_logs \(/i.test(sql)) {
    const [
      id, orgId, userId, action, resourceType, resourceId, beforeValue, afterValue, ip, createdAt,
    ] = stmt.args as [
      string, string | null, string | null, string, string, string,
      string | null, string | null, string | null, number,
    ];
    tables.audit_logs.set(id, {
      id,
      organization_id: orgId,
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      before_value: beforeValue,
      after_value: afterValue,
      ip_address: ip,
      created_at: createdAt,
    });
    return { success: true };
  }

  // ===== Onboarding =====
  if (/^UPDATE organizations SET timezone = \?, updated_at = \? WHERE id = \?$/i.test(sql)) {
    const [tz, updatedAt, id] = stmt.args as [string, number, string];
    const o = tables.organizations.get(id);
    if (o) {
      o.timezone = tz;
      o.updated_at = updatedAt;
    }
    return { success: true };
  }
  if (/^INSERT INTO businesses \(/i.test(sql)) {
    const [
      id, orgId, name, vertical, address, hoursJson,
      existingPhone, , , , createdAt, updatedAt,
    ] = stmt.args as [
      string, string, string, string, string | null, string | null,
      string | null, unknown, unknown, unknown, number, number,
    ];
    tables.businesses.set(id, {
      id,
      organization_id: orgId,
      business_name: name,
      vertical,
      address,
      hours_json: hoursJson,
      existing_phone_number: existingPhone,
      twilio_forwarding_number: null,
      vapi_phone_number_id: null,
      forwarding_probe_call_id: null,
      forwarding_probe_started_at: null,
      forwarding_verified_at: null,
      deleted_at: null,
      created_at: createdAt,
      updated_at: updatedAt,
    });
    return { success: true };
  }
  if (/^UPDATE businesses SET business_name = \?, vertical = \?, address = \?, hours_json = \?, existing_phone_number = \?, updated_at = \? WHERE id = \?$/i.test(sql)) {
    const [name, vertical, address, hoursJson, existingPhone, updatedAt, id] = stmt.args as [
      string, string, string | null, string | null, string | null, number, string,
    ];
    const b = tables.businesses.get(id);
    if (b) {
      b.business_name = name;
      b.vertical = vertical;
      b.address = address;
      b.hours_json = hoursJson;
      b.existing_phone_number = existingPhone;
      b.updated_at = updatedAt;
    }
    return { success: true };
  }
  if (/^UPDATE businesses SET forwarding_probe_call_id = \?, forwarding_probe_started_at = \?, updated_at = \? WHERE id = \? AND organization_id = \?$/i.test(sql)) {
    const [callId, startedAt, updatedAt, id, orgId] = stmt.args as [
      string, number, number, string, string,
    ];
    const b = tables.businesses.get(id);
    if (b && b.organization_id === orgId) {
      b.forwarding_probe_call_id = callId;
      b.forwarding_probe_started_at = startedAt;
      b.updated_at = updatedAt;
    }
    return { success: true };
  }

  throw new Error(`TODO(test-infra): unrecognized RUN: ${sql}`);
}

// ---------------------------------------------------------------------------
// Stub bindings (Queues, R2, etc.) the handlers don't exercise.
// ---------------------------------------------------------------------------
function stubQueue(): Bindings['WEBHOOK_DELIVERY_QUEUE'] {
  return {
    async send(_msg: unknown) {
      // no-op; tests that care can spy via vi.fn override
    },
    async sendBatch() {
      // no-op
    },
  } as unknown as Bindings['WEBHOOK_DELIVERY_QUEUE'];
}

function stubR2(): Bindings['RECORDINGS'] {
  return {} as unknown as Bindings['RECORDINGS'];
}

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------
export interface TestEnv {
  app: Hono<AppEnv>;
  db: MemD1;
  sessions: MemKV;
  webhookDedup: MemKV;
  bindings: Bindings;
}

export interface BuildAppOptions {
  envOverrides?: Partial<Bindings>;
}

export function buildTestApp(opts: BuildAppOptions = {}): TestEnv {
  const db = createMemD1();
  const sessions = createMemKV();
  const webhookDedup = createMemKV();
  const rateLimits = createMemKV();

  const bindings: Bindings = {
    DB: db,
    RECORDINGS: stubR2(),
    KNOWLEDGE_BASE: stubR2(),
    VOICE_SAMPLES: stubR2(),
    CONSENT_RECORDINGS: stubR2(),
    SESSIONS: sessions as unknown as Bindings['SESSIONS'],
    RATE_LIMITS: rateLimits as unknown as Bindings['RATE_LIMITS'],
    WEBHOOK_DEDUP: webhookDedup as unknown as Bindings['WEBHOOK_DEDUP'],
    FEATURE_FLAGS: createMemKV() as unknown as Bindings['FEATURE_FLAGS'],
    WEBHOOK_DELIVERY_QUEUE: stubQueue(),
    EMAIL_SEND_QUEUE: stubQueue(),
    KB_INDEXING_QUEUE: stubQueue(),
    CALL_GRADING_QUEUE: stubQueue(),
    USAGE_AGGREGATION_QUEUE: stubQueue(),
    DIGEST_EMAILS_QUEUE: stubQueue(),
    ENVIRONMENT: 'development',
    LOG_LEVEL: 'error',
    STRIPE_SECRET_KEY: 'sk_test_dummy',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_dummy',
    STRIPE_PRICE_STARTER_MONTHLY: 'price_test_starter_monthly',
    STRIPE_PRICE_STARTER_ANNUAL: 'price_test_starter_annual',
    STRIPE_PRICE_GROWTH_MONTHLY: 'price_test_growth_monthly',
    STRIPE_PRICE_GROWTH_ANNUAL: 'price_test_growth_annual',
    STRIPE_PRICE_PRO_MONTHLY: 'price_test_pro_monthly',
    STRIPE_PRICE_PRO_ANNUAL: 'price_test_pro_annual',
    STRIPE_PRICE_LOCATION_ADDON: 'price_test_location_addon',
    STRIPE_PRICE_OVERAGE_METERED: 'price_test_overage_metered',
    BILLING_SUCCESS_URL: 'http://localhost:3000/checkout/success',
    BILLING_CANCEL_URL: 'http://localhost:3000/checkout/cancel',
    BILLING_PORTAL_RETURN_URL: 'http://localhost:3000/dashboard/billing',
    // Stub Vectorize + Workers AI bindings — never invoked by the
    // queries the harness recognizes today, but required so the Bindings
    // type is fully satisfied under TypeScript strict mode.
    VECTORIZE: {
      upsert: async () => ({ count: 0 }),
      query: async () => ({ matches: [] }),
      deleteByIds: async () => ({ count: 0 }),
    } as unknown as Bindings['VECTORIZE'],
    AI: {
      run: async () => ({ data: [] }),
    } as unknown as Bindings['AI'],
    ...opts.envOverrides,
  };

  const app = new Hono<AppEnv>();
  app.use('*', cors());
  app.use('*', requestId());
  app.use('*', requestLogger());
  app.use('*', rateLimit());
  app.use('*', globalAuthMiddleware());
  app.route('/', routes);
  app.notFound((c) =>
    c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found',
          request_id: (c.get('request_id') as string | undefined) ?? 'unknown',
        },
      },
      404,
    ),
  );
  app.onError(errorHandler());

  return { app, db, sessions, webhookDedup, bindings };
}

// ---------------------------------------------------------------------------
// Convenience for `app.fetch(req, env)`
// ---------------------------------------------------------------------------
export interface FetchOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  cookie?: string;
}

export async function callApp(
  env: TestEnv,
  path: string,
  opts: FetchOptions = {},
): Promise<Response> {
  const headers = new Headers(opts.headers ?? {});
  if (!headers.has('content-type') && opts.body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  if (opts.cookie) headers.set('cookie', opts.cookie);
  const req = new Request(`http://localhost${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return env.app.fetch(req, env.bindings as unknown as Record<string, unknown>);
}

/** Pull `Set-Cookie` value (first one) from a Response. */
export function extractSetCookie(res: Response): string | null {
  return res.headers.get('set-cookie');
}

/** Pull session cookie name=value pair from a `Set-Cookie` header for re-sending. */
export function cookieValueFromSetCookie(setCookie: string): string {
  const first = setCookie.split(';')[0] ?? '';
  return first.trim();
}

// Re-export the D1Result interface from Workers types for the harness.
type D1Result<_T> = { results: unknown[]; success: boolean };
