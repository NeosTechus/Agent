// Team invitation flow.
//
// invite() — owner/manager creates an invitation row, returns plaintext token
//            once (mailed to the invitee via Resend).
// accept() — invitee POSTs token + (if not yet a user) password/name. Creates
//            user if needed, inserts organization_members, marks invite accepted.

import { ApiError } from "../../lib/errors";
import type { Bindings } from "../../env";
import {
  hashPassword,
  generateOpaqueToken,
  sha256Hex,
} from "../auth/crypto";

const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}
function now(): number {
  return Math.floor(Date.now() / 1000);
}

export interface ListedInvite {
  id: string;
  email: string;
  role: string;
  invited_at: number;
  expires_at: number;
  accepted_at: number | null;
}

export async function listInvites(env: Bindings, orgId: string): Promise<ListedInvite[]> {
  const res = await env.DB.prepare(
    `SELECT id, email, role, created_at AS invited_at, expires_at, accepted_at
       FROM organization_invitations
      WHERE organization_id = ?
      ORDER BY created_at DESC`,
  )
    .bind(orgId)
    .all<ListedInvite>();
  return res.results ?? [];
}

export async function listMembers(env: Bindings, orgId: string) {
  const res = await env.DB.prepare(
    `SELECT m.id, m.user_id, m.role, u.email, u.name, m.accepted_at, m.invited_at
       FROM organization_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ?
      ORDER BY (m.role = 'owner') DESC, u.email ASC`,
  )
    .bind(orgId)
    .all<{
      id: string;
      user_id: string;
      role: string;
      email: string;
      name: string | null;
      accepted_at: number | null;
      invited_at: number;
    }>();
  return res.results ?? [];
}

export async function inviteMember(
  env: Bindings,
  orgId: string,
  invitedBy: string,
  email: string,
  role: "manager" | "staff" | "viewer",
): Promise<{ invite_id: string; token: string }> {
  // Don't re-invite if already a member.
  const existing = await env.DB.prepare(
    `SELECT u.id FROM users u
       JOIN organization_members m ON m.user_id = u.id
      WHERE m.organization_id = ? AND u.email = ?`,
  )
    .bind(orgId, email.toLowerCase())
    .first<{ id: string }>();
  if (existing) throw ApiError.conflict("This email is already a member");

  const id = newId("inv");
  const token = generateOpaqueToken();
  const tokenHash = await sha256Hex(token);
  const ts = now();
  const expiresAt = ts + INVITE_TTL_SECONDS;

  await env.DB.prepare(
    `INSERT INTO organization_invitations (
       id, organization_id, email, role, invited_by_user_id, token_hash,
       expires_at, accepted_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  )
    .bind(id, orgId, email.toLowerCase(), role, invitedBy, tokenHash, expiresAt, ts, ts)
    .run();

  // Queue invitation email.
  try {
    await env.EMAIL_SEND_QUEUE.send({
      kind: "invite_email",
      to_email: email.toLowerCase(),
      organization_id: orgId,
      invite_token: token,
      role,
    });
  } catch {
    // best-effort
  }

  return { invite_id: id, token };
}

export async function acceptInvite(
  env: Bindings,
  token: string,
  passwordIfNew: string | undefined,
  nameIfNew: string | undefined,
): Promise<{ user_id: string; organization_id: string; role: string }> {
  const tokenHash = await sha256Hex(token);
  const invite = await env.DB.prepare(
    `SELECT id, organization_id, email, role, expires_at, accepted_at
       FROM organization_invitations WHERE token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{
      id: string;
      organization_id: string;
      email: string;
      role: string;
      expires_at: number;
      accepted_at: number | null;
    }>();
  if (!invite) throw ApiError.notFound("Invitation not found");
  if (invite.accepted_at) throw new ApiError("CONFLICT", "Invitation already accepted");
  if (invite.expires_at < now()) {
    throw new ApiError("UNPROCESSABLE_ENTITY", "Invitation expired");
  }

  // Create user if not present.
  let userRow = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`)
    .bind(invite.email)
    .first<{ id: string }>();

  if (!userRow) {
    if (!passwordIfNew) {
      throw ApiError.validation("Password required for new account");
    }
    const userId = newId("usr");
    const ts = now();
    const passwordHash = await hashPassword(passwordIfNew);
    await env.DB.prepare(
      `INSERT INTO users (id, email, name, password_hash, email_verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(userId, invite.email, nameIfNew ?? null, passwordHash, ts, ts, ts)
      .run();
    userRow = { id: userId };
  }

  // Insert membership.
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO organization_members (
       id, organization_id, user_id, role, invited_at, accepted_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(organization_id, user_id) DO UPDATE SET role = excluded.role, accepted_at = excluded.accepted_at`,
  )
    .bind(newId("om"), invite.organization_id, userRow.id, invite.role, ts, ts, ts, ts)
    .run();

  // Mark invite accepted.
  await env.DB.prepare(
    `UPDATE organization_invitations SET accepted_at = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(ts, ts, invite.id)
    .run();

  return { user_id: userRow.id, organization_id: invite.organization_id, role: invite.role };
}

export async function removeMember(
  env: Bindings,
  orgId: string,
  memberUserId: string,
): Promise<void> {
  // Refuse to remove the last owner.
  const ownerCount = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM organization_members WHERE organization_id = ? AND role = 'owner'`,
  )
    .bind(orgId)
    .first<{ n: number }>();
  const target = await env.DB.prepare(
    `SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ?`,
  )
    .bind(orgId, memberUserId)
    .first<{ role: string }>();
  if (!target) throw ApiError.notFound("Member not found");
  if (target.role === "owner" && (ownerCount?.n ?? 0) <= 1) {
    throw new ApiError(
      "UNPROCESSABLE_ENTITY",
      "Cannot remove the last owner. Transfer ownership first.",
    );
  }
  await env.DB.prepare(
    `DELETE FROM organization_members WHERE organization_id = ? AND user_id = ?`,
  )
    .bind(orgId, memberUserId)
    .run();
}

export async function updateMemberRole(
  env: Bindings,
  orgId: string,
  memberUserId: string,
  role: "manager" | "staff" | "viewer",
): Promise<void> {
  await env.DB.prepare(
    `UPDATE organization_members SET role = ?, updated_at = ?
       WHERE organization_id = ? AND user_id = ? AND role != 'owner'`,
  )
    .bind(role, now(), orgId, memberUserId)
    .run();
}
