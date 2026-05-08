"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { loginSchema, type LoginInput } from "@app/types/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { FormField } from "@/components/ui/FormField";
import { ErrorState } from "@/components/ui/ErrorState";
import { OAuthButtons, AuthDivider } from "@/components/auth/OAuthButtons";
import { login } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const [apiError, setApiError] = React.useState<ApiError | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: (input: LoginInput) => login(input),
    onSuccess: () => {
      toast.success("Welcome back.");
      router.push("/dashboard");
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setApiError(err);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setApiError(null);
    mutation.mutate(values);
  });

  return (
    <div>
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-ink">Log in</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Welcome back — pick up where you left off.
        </p>
      </header>

      <OAuthButtons />
      <AuthDivider label="or log in with email" />

      {apiError ? (
        <div className="mb-4">
          <ErrorState
            title="Couldn't sign you in"
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

        <FormField
          id="password"
          label="Password"
          error={form.formState.errors.password?.message}
        >
          <PasswordInput
            autoComplete="current-password"
            {...form.register("password")}
          />
        </FormField>

        <div className="flex justify-end -mt-1">
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-primary hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in…
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
