"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  passwordResetConfirmSchema,
  type PasswordResetConfirmInput,
} from "@app/types/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { FormField } from "@/components/ui/FormField";
import { ErrorState } from "@/components/ui/ErrorState";
import { confirmPasswordReset } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [apiError, setApiError] = React.useState<ApiError | null>(null);

  const form = useForm<PasswordResetConfirmInput>({
    resolver: zodResolver(passwordResetConfirmSchema),
    defaultValues: { token, password: "" },
  });

  // Keep RHF's hidden `token` in sync if the query string ever changes.
  React.useEffect(() => {
    form.setValue("token", token);
  }, [token, form]);

  const mutation = useMutation({
    mutationFn: (input: PasswordResetConfirmInput) =>
      confirmPasswordReset(input),
    onSuccess: () => {
      toast.success("Password updated. Please log in.");
      router.push("/login");
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setApiError(err);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });

  if (!token) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-ink">Missing reset token</h1>
        <p className="mt-2 text-sm text-ink-muted">
          This link is invalid. Request a new password reset email.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
        >
          Request new link
        </Link>
      </div>
    );
  }

  const onSubmit = form.handleSubmit((values) => {
    setApiError(null);
    mutation.mutate(values);
  });

  return (
    <div>
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-ink">Choose a new password</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Pick something strong you don&apos;t use elsewhere.
        </p>
      </header>

      {apiError ? (
        <div className="mb-4">
          <ErrorState
            title="Couldn't reset your password"
            description={apiError.message}
            requestId={apiError.requestId}
            onRetry={() => setApiError(null)}
            retryLabel="Dismiss"
          />
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <input type="hidden" {...form.register("token")} />

        <FormField
          id="password"
          label="New password"
          hint="At least 8 characters."
          error={form.formState.errors.password?.message}
        >
          <PasswordInput
            autoComplete="new-password"
            {...form.register("password")}
          />
        </FormField>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating…
            </>
          ) : (
            "Update password"
          )}
        </Button>
      </form>
    </div>
  );
}
