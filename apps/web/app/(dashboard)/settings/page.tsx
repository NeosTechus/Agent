"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Card,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Spinner,
} from "@/components/ui";
import {
  cancelDeletion,
  getDeletionState,
  requestDeletion,
  type DeletionState,
} from "@/lib/account";

export default function SettingsPage() {
  const qc = useQueryClient();
  const stateQuery = useQuery({
    queryKey: ["account", "deletion"],
    queryFn: getDeletionState,
  });

  const [confirmEmail, setConfirmEmail] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [showDeleteForm, setShowDeleteForm] = React.useState(false);

  const requestMutation = useMutation({
    mutationFn: () => requestDeletion({ confirm_email: confirmEmail, reason: reason || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account", "deletion"] });
      setShowDeleteForm(false);
      toast.success("Account deletion scheduled in 30 days.");
    },
    onError: (e) => toast.error((e as Error).message ?? "Request failed"),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelDeletion(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account", "deletion"] });
      toast.success("Deletion cancelled. Your account is safe.");
    },
    onError: (e) => toast.error((e as Error).message ?? "Cancel failed"),
  });

  if (stateQuery.isLoading) return <LoadingState title="Loading settings…" />;
  if (stateQuery.isError) {
    return (
      <ErrorState
        title="Could not load settings"
        description={(stateQuery.error as Error)?.message ?? "Try again."}
      />
    );
  }

  const state: DeletionState = stateQuery.data!;
  const pending = state.deletion_scheduled_at !== null;
  const daysLeft = pending && state.deletion_scheduled_at
    ? Math.max(0, Math.ceil((state.deletion_scheduled_at - Date.now() / 1000) / 86400))
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Manage your account, security, and data.
        </p>
      </div>

      {pending ? (
        <Card className="space-y-3 border-red-200 bg-red-50 p-6">
          <h2 className="text-base font-semibold text-red-900">
            Deletion scheduled in {daysLeft} day{daysLeft === 1 ? "" : "s"}
          </h2>
          <p className="text-sm text-red-800">
            Your account is scheduled for deletion on{" "}
            {state.deletion_scheduled_at
              ? new Date(state.deletion_scheduled_at * 1000).toLocaleDateString()
              : "—"}
            . All call data, recordings, and team access will be permanently removed.
          </p>
          <div>
            <Button
              variant="secondary"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? <Spinner /> : "Cancel deletion"}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="space-y-4 p-6">
          <h2 className="text-base font-semibold text-ink">Delete account</h2>
          <p className="text-sm text-ink-muted">
            Account deletion is permanent. You'll have a 30-day grace period — during that
            time you can sign back in and cancel.
          </p>
          {!showDeleteForm ? (
            <Button variant="ghost" onClick={() => setShowDeleteForm(true)}>
              I want to delete my account
            </Button>
          ) : (
            <div className="space-y-3">
              <FormField label="Type your account email to confirm">
                <Input
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                />
              </FormField>
              <FormField label="Reason (optional, helps us improve)">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </FormField>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setShowDeleteForm(false)}
                  disabled={requestMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => requestMutation.mutate()}
                  disabled={requestMutation.isPending || !confirmEmail.includes("@")}
                >
                  {requestMutation.isPending ? <Spinner /> : "Schedule deletion"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
