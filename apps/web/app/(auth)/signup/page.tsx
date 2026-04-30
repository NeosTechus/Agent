"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { signupSchema, type SignupInput } from "@app/types/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { ErrorState } from "@/components/ui/ErrorState";
import { OAuthButtons, AuthDivider } from "@/components/auth/OAuthButtons";
import { signup } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [apiError, setApiError] = React.useState<ApiError | null>(null);

  // Preserve plan/period choice from /pricing through signup so we can hand
  // them to the checkout step (PRD 4.1). Falls back to /checkout (which then
  // bounces to /pricing) when the user landed on signup directly.
  const planParam = searchParams.get("plan");
  const periodParam = searchParams.get("period");
  const checkoutHref = React.useMemo(() => {
    const params = new URLSearchParams();
    if (planParam) params.set("plan", planParam);
    if (periodParam) params.set("period", periodParam);
    const qs = params.toString();
    return qs ? `/checkout?${qs}` : "/checkout";
  }, [planParam, periodParam]);

  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", business_name: "" },
  });

  const mutation = useMutation({
    mutationFn: (input: SignupInput) => signup(input),
    onSuccess: () => {
      toast.success("Account created. Welcome aboard.");
      router.push(checkoutHref);
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
        <h1 className="text-2xl font-semibold text-ink">Create your account</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Start answering calls in minutes.
        </p>
      </header>

      <OAuthButtons />
      <AuthDivider label="or sign up with email" />

      {apiError ? (
        <div className="mb-4">
          <ErrorState
            title="Couldn't create your account"
            description={apiError.message}
            requestId={apiError.requestId}
            onRetry={() => setApiError(null)}
            retryLabel="Dismiss"
          />
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormField
          id="business_name"
          label="Business name"
          error={form.formState.errors.business_name?.message}
        >
          <Input
            type="text"
            autoComplete="organization"
            placeholder="Acme Plumbing"
            {...form.register("business_name")}
          />
        </FormField>

        <FormField
          id="email"
          label="Work email"
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
          hint="At least 8 characters."
          error={form.formState.errors.password?.message}
        >
          <Input
            type="password"
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
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
