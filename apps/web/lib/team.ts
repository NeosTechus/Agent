import { apiGet, apiPost } from "./api-client";

export interface Member {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  role: "owner" | "manager" | "staff" | "viewer";
  invited_at: number;
  accepted_at: number | null;
}

export interface Invite {
  id: string;
  email: string;
  role: string;
  invited_at: number;
  expires_at: number;
  accepted_at: number | null;
}

export function listTeam(): Promise<{ members: Member[]; invites: Invite[] }> {
  return apiGet("/v1/team");
}

export function inviteMember(
  email: string,
  role: "manager" | "staff" | "viewer",
): Promise<{ invite_id: string }> {
  return apiPost("/v1/team/invite", { email, role });
}

export async function deleteMember(userId: string): Promise<void> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
  const res = await fetch(`${API_URL}/v1/team/members/${userId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to remove member");
}

export async function updateMemberRole(
  userId: string,
  role: "manager" | "staff" | "viewer",
): Promise<void> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
  const res = await fetch(`${API_URL}/v1/team/members/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error("Failed to update role");
}

export function acceptInvite(input: {
  token: string;
  password?: string;
  name?: string;
}): Promise<{ user_id: string; organization_id: string; role: string }> {
  return apiPost("/v1/invite/accept", input);
}
