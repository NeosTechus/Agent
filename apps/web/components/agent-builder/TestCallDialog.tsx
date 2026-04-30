"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
} from "@/components/ui";
import { testCallSchema, type TestCallInput } from "@/lib/agents-types";

export interface TestCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: TestCallInput) => Promise<void>;
}

export function TestCallDialog({
  open,
  onOpenChange,
  onSubmit,
}: TestCallDialogProps) {
  const [status, setStatus] = React.useState<
    "idle" | "submitting" | "calling" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TestCallInput>({
    resolver: zodResolver(testCallSchema),
    defaultValues: { to_number: "" },
  });

  React.useEffect(() => {
    if (!open) {
      setStatus("idle");
      setErrorMsg(null);
      reset({ to_number: "" });
    }
  }, [open, reset]);

  const submit = handleSubmit(async (data) => {
    setStatus("submitting");
    setErrorMsg(null);
    try {
      await onSubmit(data);
      setStatus("calling");
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to place test call.",
      );
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Place a test call</DialogTitle>
          <DialogDescription>
            We'll ring your phone so you can hear the published agent. Enter
            your number in international format (e.g. +14155551234).
          </DialogDescription>
        </DialogHeader>

        {status === "calling" ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Calling… your phone should ring shortly.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <FormField
              id="to_number"
              label="Phone number"
              error={errors.to_number?.message}
              hint="Format: +[country code][number]"
            >
              <Input
                placeholder="+14155551234"
                autoComplete="tel"
                {...register("to_number")}
              />
            </FormField>
            {errorMsg ? (
              <p className="text-xs font-medium text-red-600" role="alert">
                {errorMsg}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={status === "submitting"}>
                {status === "submitting" ? "Calling…" : "Call my phone"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {status === "calling" ? (
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
