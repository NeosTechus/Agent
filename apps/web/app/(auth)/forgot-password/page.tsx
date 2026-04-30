"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import {
  passwordResetRequestSchema,
  type PasswordResetRequestInput,
} from "@app/types/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { ErrorState } from "@/components/ui/ErrorState";
import { requestPasswordReset } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [apiError, setApiError] = React.useState<ApiError | null>(null);
  const [submitted, setSubmitted] = React.useState(false);

  const form = useForm<PasswordResetRequestInput>({
    resolver: zodResolver(passwordResetRequestSchema),
    defaultValues: { email: "" },
  });

  const mutation = useMutation({
    mutationFn: (input: PasswordResetRequestInput) =>
      requestPasswordReset(input),
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setApiError(err);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });

  if (submitted) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold text-ink">Check your inbox</h1>
        <p className="mt-2 text-sm text-ink-muted">
          If an account exists for that email, we sent a reset link. The link
          expires in 30 minutes.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
        >
          Back to log in
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
        <h1 className="text-2xl font-semibold text-ink">Reset your password</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </header>

      {apiError ? (
        <div className="mb-4">
          <ErrorState
            title="Couldn't send reset email"
            description={apiError.message}
            requestId={apiError.requestId}
            onRetry={() => setApiError(null)}
            retryLabel="Dismiss"
          />
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormField
          id="email"
          label="Email"
          error={form.formState.errors.email?.message}
        >
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            {...form.register("email")}
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
              Sending…
            </>
          ) : (
            "Send reset link"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
