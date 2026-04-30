"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Card,
  ErrorState,
  FormField,
  Input,
  Spinner,
} from "@/components/ui";
import { acceptInvite } from "@/lib/team";

export default function AcceptInvitePage() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token") ?? "";
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");

  const accept = useMutation({
    mutationFn: () => acceptInvite({ token, name, password: password || undefined }),
    onSuccess: () => {
      toast.success("Invite accepted — log in below.");
      router.push("/login");
    },
    onError: (e) => toast.error((e as Error).message ?? "Could not accept"),
  });

  if (!token) {
    return (
      <ErrorState
        title="Invalid invitation link"
        description="This link is missing its token. Ask the person who invited you to resend the invite."
      />
    );
  }

  return (
    <Card className="space-y-4 p-6">
      <h1 className="text-xl font-semibold text-ink">Accept your invite</h1>
      <p className="text-sm text-ink-muted">
        Set up your account to join the team. If you already have an account at this
        email, leave the password blank — we'll just add you to the team.
      </p>
      <FormField label="Full name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Smith"
        />
      </FormField>
      <FormField label="Password (only if you don't have an account yet)">
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
      </FormField>
      <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
        {accept.isPending ? <Spinner /> : "Accept invite"}
      </Button>
    </Card>
  );
}
