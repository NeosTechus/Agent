"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { verifyEmail } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [apiError, setApiError] = React.useState<ApiError | null>(null);
  const [verified, setVerified] = React.useState(false);
  const triggered = React.useRef(false);

  const mutation = useMutation({
    mutationFn: (t: string) => verifyEmail({ token: t }),
    onSuccess: () => setVerified(true),
    onError: (err) => {
      if (err instanceof ApiError) setApiError(err);
    },
  });

  // Auto-fire verification once on mount when a token is present.
  React.useEffect(() => {
    if (!token || triggered.current) return;
    triggered.current = true;
    mutation.mutate(token);
  }, [token, mutation]);

  if (!token) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-ink">Missing token</h1>
        <p className="mt-2 text-sm text-ink-muted">
          This verification link is invalid or incomplete.
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

  if (verified) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold text-ink">Email verified</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Your email is confirmed. You can now use every feature on your account.
        </p>
        <Link href="/dashboard" className="mt-6 inline-block">
          <Button>Go to dashboard</Button>
        </Link>
      </div>
    );
  }

  if (apiError) {
    return (
      <ErrorState
        title="Couldn't verify your email"
        description={apiError.message}
        requestId={apiError.requestId}
        onRetry={() => {
          setApiError(null);
          triggered.current = false;
          mutation.mutate(token);
        }}
        retryLabel="Try again"
      />
    );
  }

  return (
    <div className="flex flex-col items-center text-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <h1 className="mt-4 text-2xl font-semibold text-ink">Verifying email…</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Hang tight, this only takes a second.
      </p>
    </div>
  );
}
