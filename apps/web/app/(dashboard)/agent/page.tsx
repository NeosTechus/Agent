"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";

/**
 * Recognize the 402 PAYMENT_REQUIRED envelope from the backend's subscription
 * gate (apps/api/src/middleware/require-subscription.ts). Show a sticky toast
 * with a "Choose a plan" action that drops the user into checkout.
 */
function handleSubscriptionGate(err: unknown, fallback: string): void {
  if (
    err instanceof ApiError &&
    err.status === 402 &&
    err.code === "PAYMENT_REQUIRED"
  ) {
    toast.error("An active subscription is required for this action.", {
      action: {
        label: "Choose a plan",
        onClick: () => {
          window.location.href = "/billing";
        },
      },
      duration: 10000,
    });
    return;
  }
  toast.error((err as Error)?.message ?? fallback);
}
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Spinner,
  Textarea,
} from "@/components/ui";
import { CapabilityToggles } from "@/components/agent-builder/CapabilityToggles";
import { VoicePickerGrid } from "@/components/agent-builder/VoicePickerGrid";
import { VersionList } from "@/components/agent-builder/VersionList";
import { LivePreviewPane } from "@/components/agent-builder/LivePreviewPane";
import { TestCallDialog } from "@/components/agent-builder/TestCallDialog";
import { queryKeys } from "@/lib/query-keys";
import {
  createAgent,
  getAgent,
  listAgents,
  listVersions,
  listVoices,
  placeTestCall,
  publishAgent,
  rollbackAgent,
  updateAgent,
} from "@/lib/agents";
import {
  DEFAULT_CAPABILITIES,
  updateAgentSchema,
  verticalSchema,
  type Agent,
  type Capabilities,
  type UpdateAgentInput,
  type Vertical,
} from "@/lib/agents-types";
import { VERTICAL_TEMPLATES } from "@/lib/agent-templates";

export default function AgentPage() {
  const qc = useQueryClient();

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(),
    queryFn: listAgents,
  });

  const firstAgent = agentsQuery.data?.agents[0];
  const agentId = firstAgent?.id;

  if (agentsQuery.isLoading) {
    return <LoadingState title="Loading agent…" />;
  }
  if (agentsQuery.isError) {
    return (
      <ErrorState
        title="Could not load agent"
        description={(agentsQuery.error as Error)?.message ?? "Try again."}
      />
    );
  }
  if (!agentId) {
    return (
      <CreateAgentEmpty
        onCreated={() => qc.invalidateQueries({ queryKey: queryKeys.agents.all })}
      />
    );
  }
  return <Builder agentId={agentId} />;
}

function CreateAgentEmpty({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Agent</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Configure how your AI receptionist greets callers, handles requests, and escalates urgent matters.
        </p>
      </div>
      <EmptyState
        title="No agent configured"
        description="Build your first agent — pick a voice, set the greeting, and define what callers can ask about."
        action={<Button onClick={() => setOpen(true)}>Create agent</Button>}
      />
      {open ? <CreateAgentDialog onCreated={onCreated} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function CreateAgentDialog({
  onCreated,
  onClose,
}: {
  onCreated: () => void;
  onClose: () => void;
}) {
  const [name, setName] = React.useState("");
  const [vertical, setVertical] = React.useState<Vertical>("generic");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const parsedName = name.trim();
    if (parsedName.length === 0) {
      setErr("Name is required");
      return;
    }
    const v = verticalSchema.safeParse(vertical);
    if (!v.success) {
      setErr("Pick a vertical");
      return;
    }
    setBusy(true);
    try {
      const tpl = VERTICAL_TEMPLATES[vertical];
      await createAgent({
        name: parsedName,
        vertical,
        system_prompt: tpl.system_prompt,
        first_message: tpl.first_message,
        // Default to Rachel (first stock voice). User can change in the
        // builder. Backend requires a non-empty voice_id at create time.
        voice_id: "21m00Tcm4TlvDq8ikWAM",
        capabilities: tpl.capabilities,
      });
      toast.success("Agent created");
      onCreated();
      onClose();
    } catch (e) {
      setErr((e as Error).message ?? "Failed to create agent");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-ink">Create agent</h2>
        <p className="mt-1 text-sm text-ink-muted">Pick a vertical to seed your starting prompt — you can edit it.</p>
        <div className="mt-4 space-y-4">
          <FormField label="Agent name">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mario's Pizza"
            />
          </FormField>
          <FormField label="Vertical">
            <select
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              value={vertical}
              onChange={(e) => setVertical(e.target.value as Vertical)}
            >
              {Object.entries(VERTICAL_TEMPLATES).map(([id, tpl]) => (
                <option key={id} value={id}>
                  {tpl.label} — {tpl.description}
                </option>
              ))}
            </select>
          </FormField>
          {err ? <p className="text-sm text-red-600">{err}</p> : null}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : "Create"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

interface FormShape {
  name: string;
  first_message: string;
  system_prompt: string;
  voice_id: string;
  capabilities: Capabilities;
}

function Builder({ agentId }: { agentId: string }) {
  const qc = useQueryClient();
  const agentQuery = useQuery({
    queryKey: queryKeys.agents.byId(agentId),
    queryFn: () => getAgent(agentId).then((r) => r.agent),
  });
  const voicesQuery = useQuery({
    queryKey: queryKeys.agents.voices(),
    queryFn: () => listVoices().then((r) => r.voices),
  });
  const versionsQuery = useQuery({
    queryKey: queryKeys.agents.versions(agentId),
    queryFn: () => listVersions(agentId).then((r) => r.versions),
  });

  const form = useForm<FormShape>({
    resolver: zodResolver(updateAgentSchema as unknown as never),
    defaultValues: {
      name: "",
      first_message: "",
      system_prompt: "",
      voice_id: "",
      capabilities: DEFAULT_CAPABILITIES,
    },
  });

  React.useEffect(() => {
    if (!agentQuery.data) return;
    const a = agentQuery.data;
    form.reset({
      name: a.name,
      first_message: a.first_message,
      system_prompt: a.system_prompt,
      voice_id: a.voice_id ?? "",
      capabilities: a.capabilities,
    });
  }, [agentQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: (input: UpdateAgentInput) => updateAgent(agentId, input).then((r) => r.agent),
    onSuccess: (agent) => {
      qc.setQueryData(queryKeys.agents.byId(agentId), agent);
      toast.success("Saved");
    },
    onError: (e) => toast.error((e as Error).message ?? "Save failed"),
  });

  const publishMutation = useMutation({
    mutationFn: () => publishAgent(agentId).then((r) => r.agent),
    onSuccess: (agent) => {
      qc.setQueryData(queryKeys.agents.byId(agentId), agent);
      qc.invalidateQueries({ queryKey: queryKeys.agents.versions(agentId) });
      toast.success("Published");
    },
    onError: (e) => handleSubscriptionGate(e, "Publish failed"),
  });

  const rollbackMutation = useMutation({
    mutationFn: (versionId: string) =>
      rollbackAgent(agentId, { version_id: versionId }).then((r) => r.agent),
    onSuccess: (agent) => {
      qc.setQueryData(queryKeys.agents.byId(agentId), agent);
      qc.invalidateQueries({ queryKey: queryKeys.agents.versions(agentId) });
      toast.success("Rolled back");
    },
    onError: (e) => toast.error((e as Error).message ?? "Rollback failed"),
  });

  const testCallMutation = useMutation({
    mutationFn: (to: string) => placeTestCall(agentId, { to_number: to }),
    onSuccess: () => toast.success("Calling — your phone should ring shortly."),
    onError: (e) => handleSubscriptionGate(e, "Test call failed"),
  });

  const [testCallOpen, setTestCallOpen] = React.useState(false);
  const [step, setStep] = React.useState<1 | 2 | 3 | 4>(1);

  const isDirty = form.formState.isDirty;
  React.useEffect(() => {
    if (!isDirty) return;
    const t = setTimeout(() => {
      const v = form.getValues();
      saveMutation.mutate({
        name: v.name,
        first_message: v.first_message,
        system_prompt: v.system_prompt,
        voice_id: v.voice_id || undefined,
        capabilities: v.capabilities,
      });
      form.reset(v);
    }, 5_000);
    return () => clearTimeout(t);
  }, [isDirty, form, saveMutation]);

  if (agentQuery.isLoading) return <LoadingState title="Loading agent…" />;
  if (agentQuery.isError || !agentQuery.data) {
    return (
      <ErrorState
        title="Could not load agent"
        description={(agentQuery.error as Error | undefined)?.message ?? "Try again."}
      />
    );
  }

  const agent: Agent = agentQuery.data;
  const voices = voicesQuery.data ?? [];
  const versions = versionsQuery.data ?? [];

  const onSaveClick = form.handleSubmit((v) =>
    saveMutation.mutate({
      name: v.name,
      first_message: v.first_message,
      system_prompt: v.system_prompt,
      voice_id: v.voice_id || undefined,
      capabilities: v.capabilities,
    }),
  );

  const onDiscard = () => {
    form.reset({
      name: agent.name,
      first_message: agent.first_message,
      system_prompt: agent.system_prompt,
      voice_id: agent.voice_id ?? "",
      capabilities: agent.capabilities,
    });
  };

  const watch = form.watch();

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[14rem_1fr_18rem]">
      <aside>
        <CollapsibleAside title="Versions">
          <VersionList
            versions={versions}
            activeId={agent.published_version_id ?? undefined}
            onRollback={(v) => rollbackMutation.mutate(v.id)}
            isRollingBack={rollbackMutation.isPending}
          />
        </CollapsibleAside>
      </aside>

      <main className="min-w-0 space-y-6">
        {/* Page header — name, status, primary action */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold text-ink">{agent.name}</h1>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span
                className={
                  isDirty
                    ? "inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800"
                    : "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
                }
              >
                <span
                  className={
                    isDirty ? "h-1.5 w-1.5 rounded-full bg-amber-500" : "h-1.5 w-1.5 rounded-full bg-emerald-500"
                  }
                />
                {isDirty ? "Unsaved changes" : "All changes saved"}
              </span>
              {agent.published_version_id ? (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  Published v{versions.find((v) => v.id === agent.published_version_id)?.version ?? "?"}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  Draft
                </span>
              )}
            </div>
          </div>
          <Button variant="secondary" onClick={() => setTestCallOpen(true)}>
            Place test call
          </Button>
        </div>

        {/* Stepper — clickable to jump, current step bolded, completed = checkmark */}
        <Stepper
          steps={WIZARD_STEPS}
          current={step}
          onJump={setStep}
        />

        {/* Single focused step */}
        <Card className="min-h-[400px] p-6">
          {step === 1 ? (
            <div>
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-ink">Identity</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  How your agent introduces itself when it picks up.
                </p>
              </div>
              <div className="space-y-4">
                <FormField label="Agent name">
                  <Input {...form.register("name")} />
                </FormField>
                <FormField label="First message" hint="Use {{business_name}} for personalization.">
                  <Textarea rows={2} {...form.register("first_message")} />
                </FormField>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-ink">Personality &amp; instructions</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Define how your agent talks, what it knows, and what it should do during a call.
                </p>
              </div>
              <FormField label="System prompt">
                <Textarea
                  rows={16}
                  className="font-mono text-xs"
                  {...form.register("system_prompt")}
                />
                <p className="mt-1 text-xs text-ink-muted">
                  {watch.system_prompt?.length ?? 0} / 20,000 characters
                </p>
              </FormField>
            </div>
          ) : null}

          {step === 3 ? (
            <div>
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-ink">Voice</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Pick how your agent sounds. Click any voice to preview a sample.
                </p>
              </div>
              <Controller
                control={form.control}
                name="voice_id"
                render={({ field }) => (
                  <VoicePickerGrid
                    voices={voices}
                    value={field.value || null}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          ) : null}

          {step === 4 ? (
            <div>
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-ink">Capabilities &amp; safety</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Choose what the agent is allowed to do during a call. Review before publishing.
                </p>
              </div>
              <Controller
                control={form.control}
                name="capabilities"
                render={({ field }) => (
                  <CapabilityToggles value={field.value} onChange={field.onChange} />
                )}
              />
              <div className="mt-6 flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <span aria-hidden="true" className="mt-0.5 text-base leading-none">⚠️</span>
                <div>
                  <p className="font-medium">Built-in safety</p>
                  <p className="mt-0.5 text-xs text-amber-800">
                    Your agent will always refuse legal, medical, and financial advice. These
                    guardrails apply regardless of your prompt.
                  </p>
                </div>
              </div>

              {/* Quick review summary */}
              <div className="mt-5 rounded-md border border-border bg-surface/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Review</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Name</dt>
                    <dd className="truncate text-ink">{watch.name || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">Voice</dt>
                    <dd className="truncate text-ink">
                      {voices.find((v) => v.id === watch.voice_id)?.name ?? "Not selected"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">First message</dt>
                    <dd className="ml-4 line-clamp-2 text-right text-ink">
                      {watch.first_message || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">System prompt</dt>
                    <dd className="text-ink">{watch.system_prompt?.length ?? 0} chars</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}
        </Card>

        {/* Step navigation + global actions */}
        <div className="sticky bottom-0 -mx-4 mt-2 flex flex-col gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:-mx-6 md:px-6">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : 1))}
              disabled={step === 1}
            >
              ← Back
            </Button>
            {step < 4 ? (
              <Button onClick={() => setStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : 4))}>
                Next →
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onDiscard} disabled={!isDirty || saveMutation.isPending}>
              Discard
            </Button>
            <Button variant="secondary" onClick={onSaveClick} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Spinner /> : "Save draft"}
            </Button>
            {step === 4 ? (
              <Button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
                {publishMutation.isPending ? <Spinner /> : "Publish agent"}
              </Button>
            ) : null}
          </div>
        </div>
      </main>

      <aside>
        <CollapsibleAside title="Live preview">
          <LivePreviewPane
            businessName={agent.name}
            firstMessage={watch.first_message ?? ""}
            capabilities={watch.capabilities ?? DEFAULT_CAPABILITIES}
          />
        </CollapsibleAside>
      </aside>

      <TestCallDialog
        open={testCallOpen}
        onOpenChange={setTestCallOpen}
        onSubmit={async (input) => {
          await testCallMutation.mutateAsync(input.to_number);
          setTestCallOpen(false);
        }}
      />
    </div>
  );
}

/**
 * Collapsible-on-mobile, always-visible-on-desktop aside wrapper. Below md
 * the toggle button is shown and content is hidden by default; on md+ the
 * toggle button is hidden and the content is unconditionally visible. This
 * keeps Versions + Live Preview reachable without hiding them entirely on
 * small screens.
 */
function CollapsibleAside({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-ink shadow-sm md:hidden"
      >
        <span>{title}</span>
        <span aria-hidden className="text-ink-muted">
          {open ? "−" : "+"}
        </span>
      </button>
      <div className={`${open ? "mt-2 block" : "hidden"} md:mt-0 md:block`}>
        {children}
      </div>
    </div>
  );
}

/** Steps for the agent setup wizard. Order matters — Stepper renders left-to-right. */
const WIZARD_STEPS: Array<{ id: 1 | 2 | 3 | 4; label: string; hint: string }> = [
  { id: 1, label: "Identity", hint: "Name &amp; greeting" },
  { id: 2, label: "Personality", hint: "System prompt" },
  { id: 3, label: "Voice", hint: "Pick a voice" },
  { id: 4, label: "Capabilities", hint: "Review &amp; publish" },
];

/**
 * Horizontal step indicator. Each step is clickable so users can jump back
 * (the form persists across steps via react-hook-form). Current step is bold,
 * completed steps show a checkmark, future steps are greyed.
 */
function Stepper({
  steps,
  current,
  onJump,
}: {
  steps: Array<{ id: 1 | 2 | 3 | 4; label: string; hint: string }>;
  current: 1 | 2 | 3 | 4;
  onJump: (id: 1 | 2 | 3 | 4) => void;
}) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto rounded-md border border-border bg-white p-2 text-sm">
      {steps.map((s, i) => {
        const done = s.id < current;
        const active = s.id === current;
        return (
          <li key={s.id} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => onJump(s.id)}
              className={`flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                active
                  ? "bg-primary/5 ring-1 ring-primary/30"
                  : done
                  ? "hover:bg-surface"
                  : "text-ink-muted hover:bg-surface"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  active
                    ? "bg-primary text-white"
                    : done
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
                aria-hidden="true"
              >
                {done ? "✓" : s.id}
              </span>
              <span className="min-w-0">
                <span
                  className={`block truncate text-sm ${
                    active ? "font-semibold text-ink" : done ? "text-ink" : "text-ink-muted"
                  }`}
                >
                  {s.label}
                </span>
                <span className="block truncate text-[11px] text-ink-muted">{s.hint}</span>
              </span>
            </button>
            {i < steps.length - 1 ? (
              <span aria-hidden="true" className="hidden h-px w-4 shrink-0 bg-slate-200 sm:block" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
