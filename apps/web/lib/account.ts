import { apiGet, apiPost } from "./api-client";

export interface DeletionState {
  deletion_requested_at: number | null;
  deletion_scheduled_at: number | null;
  grace_period_seconds: number;
}

export function getDeletionState(): Promise<DeletionState> {
  return apiGet("/v1/account/deletion");
}

export function requestDeletion(input: {
  confirm_email: string;
  reason?: string;
}): Promise<DeletionState> {
  return apiPost("/v1/account/deletion/request", input);
}

export function cancelDeletion(): Promise<DeletionState> {
  return apiPost("/v1/account/deletion/cancel", {});
}
