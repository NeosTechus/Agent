"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
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
        voice_id: null,
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
    onError: (e) => toast.error((e as Error).message ?? "Publish failed"),
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
    onError: (e) => toast.error((e as Error).message ?? "Test call failed"),
  });

  const [testCallOpen, setTestCallOpen] = React.useState(false);

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
      <aside className="hidden md:block">
        <VersionList
          versions={versions}
          activeId={agent.published_version_id ?? undefined}
          onRollback={(v) => rollbackMutation.mutate(v.id)}
          isRollingBack={rollbackMutation.isPending}
        />
      </aside>

      <main className="min-w-0 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink">{agent.name}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {isDirty ? "Unsaved changes" : "All changes saved"}
            </p>
          </div>
          <Button variant="secondary" onClick={() => setTestCallOpen(true)}>
            Place test call
          </Button>
        </div>

        <Card className="space-y-4 p-6">
          <FormField label="Agent name">
            <Input {...form.register("name")} />
          </FormField>
          <FormField label="First message" hint="Use {{business_name}} for personalization.">
            <Textarea rows={2} {...form.register("first_message")} />
          </FormField>
          <FormField label="System prompt">
            <Textarea
              rows={20}
              className="font-mono text-xs"
              {...form.register("system_prompt")}
            />
            <p className="mt-1 text-xs text-ink-muted">
              {watch.system_prompt?.length ?? 0} / 20,000 characters
            </p>
          </FormField>
        </Card>

        <Card className="space-y-3 p-6">
          <h2 className="text-sm font-medium text-ink">Voice</h2>
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
        </Card>

        <Card className="space-y-3 p-6">
          <h2 className="text-sm font-medium text-ink">Capabilities</h2>
          <Controller
            control={form.control}
            name="capabilities"
            render={({ field }) => (
              <CapabilityToggles value={field.value} onChange={field.onChange} />
            )}
          />
        </Card>

        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Built-in safety:</strong> the agent will always refuse legal, medical, and
          financial advice — these guardrails apply regardless of your prompt.
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-slate-200 bg-white py-3">
          <Button variant="ghost" onClick={onDiscard} disabled={!isDirty || saveMutation.isPending}>
            Discard changes
          </Button>
          <Button variant="secondary" onClick={onSaveClick} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Spinner /> : "Save draft"}
          </Button>
          <Button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
            {publishMutation.isPending ? <Spinner /> : "Publish"}
          </Button>
        </div>
      </main>

      <aside className="hidden md:block">
        <LivePreviewPane
          businessName={agent.name}
          firstMessage={watch.first_message ?? ""}
          capabilities={watch.capabilities ?? DEFAULT_CAPABILITIES}
        />
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
