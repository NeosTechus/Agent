"use client";

export const dynamic = "force-dynamic";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  Textarea,
} from "@/components/ui";
import { CapabilityToggles } from "@/components/agent-builder/CapabilityToggles";
import { VoicePickerGrid } from "@/components/agent-builder/VoicePickerGrid";
import { queryKeys } from "@/lib/query-keys";
import { listAgents, listVoices, createAgent, placeTestCall } from "@/lib/agents";
import {
  CARRIER_FORWARDING_INSTRUCTIONS,
  US_TIMEZONES,
  carrierKey,
  getOnboardingState,
  guessUserTimezone,
  saveBusiness,
  validateForwarding,
  type BusinessState,
} from "@/lib/onboarding";
import {
  HoursOfOperationGrid,
  allDaysClosed,
  parseHoursJson,
  validateHours,
  type Hours,
} from "@/components/onboarding/HoursOfOperationGrid";
import { provisionNumber, lookupCarrier } from "@/lib/phone-numbers";
import { uploadDoc } from "@/lib/knowledge-base";
import { VERTICAL_TEMPLATES } from "@/lib/agent-templates";
import { DEFAULT_CAPABILITIES, type Capabilities, type Vertical } from "@/lib/agents-types";

const STEPS = [
  { id: 1, label: "Business" },
  { id: 2, label: "Phone" },
  { id: 3, label: "Voice" },
  { id: 4, label: "Knowledge" },
  { id: 5, label: "Agent" },
  { id: 6, label: "Test call" },
  { id: 7, label: "Forwarding" },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const step = Math.max(1, Math.min(7, Number(sp.get("step") ?? "1")));
  const setStep = (n: number) => router.replace(`/onboarding?step=${n}`);

  const stateQuery = useQuery({
    queryKey: ["onboarding", "state"],
    queryFn: () => getOnboardingState().then((r) => r.business),
  });

  if (stateQuery.isLoading) return <LoadingState title="Loading onboarding…" />;
  if (stateQuery.isError) {
    return (
      <ErrorState
        title="Could not load onboarding"
        description={(stateQuery.error as Error)?.message ?? "Try again."}
      />
    );
  }

  const business = stateQuery.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Get your agent live</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Seven quick steps. You can come back later — your progress is saved.
        </p>
      </header>
      <Stepper current={step} />
      {step === 1 && <Step1Business business={business ?? null} onNext={() => setStep(2)} />}
      {step === 2 && <Step2Phone business={business ?? null} onNext={() => setStep(3)} />}
      {step === 3 && <Step3Voice onNext={() => setStep(4)} />}
      {step === 4 && <Step4Knowledge business={business ?? null} onNext={() => setStep(5)} />}
      {step === 5 && <Step5Agent onNext={() => setStep(6)} />}
      {step === 6 && <Step6TestCall onNext={() => setStep(7)} />}
      {step === 7 && <Step7Forwarding business={business ?? null} />}
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-2 text-xs">
      {STEPS.map((s) => {
        const state =
          s.id < current ? "done" : s.id === current ? "active" : "pending";
        return (
          <li key={s.id} className="flex items-center">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium ${
                state === "done"
                  ? "bg-emerald-100 text-emerald-700"
                  : state === "active"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {s.id}
            </span>
            <span
              className={`ml-2 mr-3 ${
                state === "active"
                  ? "font-medium text-ink"
                  : "text-ink-muted"
              }`}
            >
              {s.label}
            </span>
            {s.id !== STEPS.length && (
              <span className="mr-3 h-px w-6 bg-slate-200" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Business details
// ---------------------------------------------------------------------------

function Step1Business({
  business,
  onNext,
}: {
  business: BusinessState | null;
  onNext: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = React.useState(business?.business_name ?? "");
  const [vertical, setVertical] = React.useState<Vertical>(
    (business?.vertical as Vertical) ?? "generic",
  );
  const [address, setAddress] = React.useState(business?.address ?? "");
  const [existing, setExisting] = React.useState(business?.existing_phone_number ?? "");
  const [timezone, setTimezone] = React.useState<string>(() => guessUserTimezone());
  const [hours, setHours] = React.useState<Hours>(() =>
    parseHoursJson(business?.hours_json ?? null),
  );

  const trySave = () => {
    const err = validateHours(hours);
    if (err) {
      toast.error(err.message);
      return;
    }
    if (allDaysClosed(hours)) {
      const ok = window.confirm(
        "All days are marked closed — your agent will tell callers you're closed permanently. Continue?",
      );
      if (!ok) return;
    }
    save.mutate();
  };

  const save = useMutation({
    mutationFn: () =>
      saveBusiness({
        business_name: name,
        vertical,
        address: address || undefined,
        existing_phone_number: existing || undefined,
        timezone,
        hours_json: JSON.stringify(hours),
      }),
    onSuccess: ({ business: b }) => {
      qc.setQueryData(["onboarding", "state"], b);
      window.localStorage.setItem("active_business_id", b.id);
      toast.success("Saved");
      onNext();
    },
    onError: (e) => toast.error((e as Error).message ?? "Save failed"),
  });

  return (
    <Card className="space-y-4 p-6">
      <h2 className="text-lg font-semibold text-ink">Step 1 · Business details</h2>
      <FormField label="Business name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mario's Pizza" />
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
      <FormField label="Hours of operation">
        <HoursOfOperationGrid value={hours} onChange={setHours} />
      </FormField>
      <FormField label="Address (optional)">
        <Input value={address} onChange={(e) => setAddress(e.target.value)} />
      </FormField>
      <FormField label="Your existing business phone (we'll auto-detect your carrier)">
        <Input
          value={existing}
          onChange={(e) => setExisting(e.target.value)}
          placeholder="+15555550100"
        />
      </FormField>
      <FormField label="Timezone (drives weekly digest delivery)">
        <select
          className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {US_TIMEZONES.map((tz) => (
            <option key={tz.id} value={tz.id}>
              {tz.label}
            </option>
          ))}
          {!US_TIMEZONES.find((t) => t.id === timezone) && (
            <option value={timezone}>{timezone}</option>
          )}
        </select>
      </FormField>
      <div className="flex justify-end">
        <Button onClick={trySave} disabled={save.isPending || name.trim().length === 0}>
          {save.isPending ? <Spinner /> : "Save & continue"}
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Phone number provisioning
// ---------------------------------------------------------------------------

function Step2Phone({
  business,
  onNext,
}: {
  business: BusinessState | null;
  onNext: () => void;
}) {
  const qc = useQueryClient();
  const [areaCode, setAreaCode] = React.useState("");
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(),
    queryFn: listAgents,
  });
  const firstAgent = agentsQuery.data?.agents[0];

  const provision = useMutation({
    mutationFn: () => {
      if (!business || !firstAgent) throw new Error("Complete prior steps first");
      return provisionNumber({
        business_id: business.id,
        agent_id: firstAgent.id,
        area_code: areaCode || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding", "state"] });
      toast.success("Number provisioned");
      onNext();
    },
    onError: (e) => toast.error((e as Error).message ?? "Provision failed"),
  });

  if (!business) {
    return (
      <Card className="p-6 text-sm text-ink-muted">
        Save your business details first (Step 1).
      </Card>
    );
  }

  if (business.twilio_forwarding_number) {
    return (
      <Card className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-ink">Step 2 · Phone number</h2>
        <p className="text-sm text-ink">
          You already have a number: <strong>{business.twilio_forwarding_number}</strong>
        </p>
        <div className="flex justify-end">
          <Button onClick={onNext}>Continue</Button>
        </div>
      </Card>
    );
  }

  if (!firstAgent) {
    return (
      <Card className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-ink">Step 2 · Phone number</h2>
        <p className="text-sm text-ink-muted">
          We'll provision your number after you create an agent. You can do that on Step 5
          and come back. Skipping for now.
        </p>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onNext}>
            Skip
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-6">
      <h2 className="text-lg font-semibold text-ink">Step 2 · Phone number</h2>
      <FormField label="Preferred area code (optional)">
        <Input
          value={areaCode}
          onChange={(e) => setAreaCode(e.target.value)}
          placeholder="415"
          maxLength={3}
        />
      </FormField>
      <p className="text-xs text-ink-muted">
        Cost is bundled into your plan — no extra charge.
      </p>
      <div className="flex justify-end">
        <Button onClick={() => provision.mutate()} disabled={provision.isPending}>
          {provision.isPending ? <Spinner /> : "Provision number"}
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Voice picker (stored in localStorage until Step 5 creates the agent)
// ---------------------------------------------------------------------------

function Step3Voice({ onNext }: { onNext: () => void }) {
  const voicesQuery = useQuery({
    queryKey: queryKeys.agents.voices(),
    queryFn: () => listVoices().then((r) => r.voices),
  });
  const [selected, setSelected] = React.useState<string | null>(() =>
    typeof window !== "undefined" ? window.localStorage.getItem("draft_voice_id") : null,
  );

  const onChange = (id: string) => {
    setSelected(id);
    window.localStorage.setItem("draft_voice_id", id);
  };

  return (
    <Card className="space-y-4 p-6">
      <h2 className="text-lg font-semibold text-ink">Step 3 · Pick a voice</h2>
      {voicesQuery.isLoading ? (
        <LoadingState title="Loading voices…" />
      ) : (
        <VoicePickerGrid
          voices={voicesQuery.data ?? []}
          value={selected}
          onChange={onChange}
        />
      )}
      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!selected}>
          Continue
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Knowledge base upload
// ---------------------------------------------------------------------------

function Step4Knowledge({
  business,
  onNext,
}: {
  business: BusinessState | null;
  onNext: () => void;
}) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) => {
      if (!business) throw new Error("Save business first");
      return uploadDoc(business.id, file);
    },
    onSuccess: () => toast.success("Document uploaded — indexing in background."),
    onError: (e) => toast.error((e as Error).message ?? "Upload failed"),
  });

  return (
    <Card className="space-y-4 p-6">
      <h2 className="text-lg font-semibold text-ink">Step 4 · Knowledge base</h2>
      <p className="text-sm text-ink-muted">
        Upload menus, hours, FAQ, or anything your agent should know about. You can do this
        later too — your agent will work without it.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.txt,.md,.json,.csv,application/pdf,text/plain,text/markdown,application/json,text/csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />
      <div className="flex justify-between">
        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? <Spinner /> : "Upload a document"}
        </Button>
        <Button onClick={onNext}>Continue</Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Agent customization
// ---------------------------------------------------------------------------

function Step5Agent({ onNext }: { onNext: () => void }) {
  const qc = useQueryClient();
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(),
    queryFn: listAgents,
  });
  const existing = agentsQuery.data?.agents[0];
  const [vertical, setVertical] = React.useState<Vertical>("generic");
  const [systemPrompt, setSystemPrompt] = React.useState("");
  const [firstMessage, setFirstMessage] = React.useState("");
  const [name, setName] = React.useState("");
  const [caps, setCaps] = React.useState<Capabilities>(DEFAULT_CAPABILITIES);

  React.useEffect(() => {
    if (existing) {
      setName(existing.name);
      setSystemPrompt(existing.system_prompt);
      setFirstMessage(existing.first_message);
      setCaps(existing.capabilities);
    } else {
      const tpl = VERTICAL_TEMPLATES[vertical];
      setName((prev) => prev || "My agent");
      setSystemPrompt((prev) => prev || tpl.system_prompt);
      setFirstMessage((prev) => prev || tpl.first_message);
      setCaps((prev) => (existing ? prev : tpl.capabilities));
    }
  }, [existing, vertical]);

  const create = useMutation({
    mutationFn: () => {
      const voiceId =
        typeof window !== "undefined"
          ? window.localStorage.getItem("draft_voice_id")
          : null;
      if (!voiceId) throw new Error("Pick a voice in Step 3 first");
      return createAgent({
        name,
        vertical,
        system_prompt: systemPrompt,
        first_message: firstMessage,
        voice_id: voiceId,
        capabilities: caps,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.agents.all });
      toast.success("Agent created");
      onNext();
    },
    onError: (e) => toast.error((e as Error).message ?? "Create failed"),
  });

  if (existing) {
    return (
      <Card className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-ink">Step 5 · Agent</h2>
        <p className="text-sm text-ink">
          You already have an agent: <strong>{existing.name}</strong>. Tweak it any time on the
          <a className="text-indigo-600 hover:underline" href="/agent"> Agent</a> page.
        </p>
        <div className="flex justify-end">
          <Button onClick={onNext}>Continue</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-6">
      <h2 className="text-lg font-semibold text-ink">Step 5 · Customize your agent</h2>
      <FormField label="Agent name">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label="Template (seeds the prompt)">
        <select
          className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          value={vertical}
          onChange={(e) => {
            const v = e.target.value as Vertical;
            setVertical(v);
            const tpl = VERTICAL_TEMPLATES[v];
            setSystemPrompt(tpl.system_prompt);
            setFirstMessage(tpl.first_message);
            setCaps(tpl.capabilities);
          }}
        >
          {Object.entries(VERTICAL_TEMPLATES).map(([id, tpl]) => (
            <option key={id} value={id}>
              {tpl.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="First message">
        <Textarea rows={2} value={firstMessage} onChange={(e) => setFirstMessage(e.target.value)} />
      </FormField>
      <FormField label="System prompt">
        <Textarea
          rows={10}
          className="font-mono text-xs"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
      </FormField>
      <div>
        <h3 className="mb-2 text-sm font-medium text-ink">Capabilities</h3>
        <CapabilityToggles value={caps} onChange={setCaps} />
      </div>
      <div className="flex justify-end">
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? <Spinner /> : "Create agent"}
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 6 — Test call
// ---------------------------------------------------------------------------

function Step6TestCall({ onNext }: { onNext: () => void }) {
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(),
    queryFn: listAgents,
  });
  const agent = agentsQuery.data?.agents[0];
  const [phone, setPhone] = React.useState("");
  const place = useMutation({
    mutationFn: () => {
      if (!agent) throw new Error("Create an agent first");
      return placeTestCall(agent.id, { to_number: phone });
    },
    onSuccess: () => toast.success("Calling — your phone should ring shortly."),
    onError: (e) => toast.error((e as Error).message ?? "Test call failed"),
  });

  return (
    <Card className="space-y-4 p-6">
      <h2 className="text-lg font-semibold text-ink">Step 6 · Place a test call</h2>
      <p className="text-sm text-ink-muted">
        Enter your cell phone number. Our agent will call you so you can hear it speak.
      </p>
      <FormField label="Your phone number (E.164)">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15555550100" />
      </FormField>
      <div className="flex justify-between">
        <Button
          variant="secondary"
          onClick={() => place.mutate()}
          disabled={place.isPending || !phone || !agent}
        >
          {place.isPending ? <Spinner /> : "Call me"}
        </Button>
        <Button onClick={onNext}>Continue</Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 7 — Forwarding setup with carrier auto-detect
// ---------------------------------------------------------------------------

function Step7Forwarding({ business }: { business: BusinessState | null }) {
  const [carrier, setCarrier] = React.useState<string>("unknown");
  const [validateResult, setValidateResult] = React.useState<{
    status: "pending" | "verified" | "failed";
    detail: string;
  } | null>(null);
  const [carrierLoading, setCarrierLoading] = React.useState(false);

  React.useEffect(() => {
    if (!business?.existing_phone_number) return;
    setCarrierLoading(true);
    lookupCarrier(business.existing_phone_number)
      .then((res) => setCarrier(carrierKey(res.carrier_name)))
      .catch(() => setCarrier("unknown"))
      .finally(() => setCarrierLoading(false));
  }, [business?.existing_phone_number]);

  const validate = useMutation({
    mutationFn: () => {
      if (!business) throw new Error("No business");
      return validateForwarding(business.id);
    },
    onSuccess: (r) => {
      setValidateResult(r);
      if (r.status === "verified") toast.success("Forwarding confirmed");
      else if (r.status === "pending") toast.info(r.detail);
      else toast.error(r.detail);
    },
    onError: (e) => toast.error((e as Error).message ?? "Validation failed"),
  });

  const instructions =
    CARRIER_FORWARDING_INSTRUCTIONS[carrier] ?? CARRIER_FORWARDING_INSTRUCTIONS.unknown!;
  const ourNumber = business?.twilio_forwarding_number ?? "<your platform number>";

  return (
    <Card className="space-y-4 p-6">
      <h2 className="text-lg font-semibold text-ink">Step 7 · Forward your business line</h2>
      <p className="text-sm text-ink-muted">
        Forward calls from your existing business number to the platform number we provisioned.
      </p>
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
        <strong>Detected carrier:</strong> {carrierLoading ? "looking up…" : instructions.label}
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-ink">
          {instructions.steps.map((s, i) => (
            <li key={i}>{s.replace(/<our_number>/g, ourNumber)}</li>
          ))}
        </ol>
      </div>
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          onClick={() => validate.mutate()}
          disabled={validate.isPending}
        >
          {validate.isPending ? <Spinner /> : "Verify forwarding"}
        </Button>
        <a
          href="/dashboard"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Finish onboarding →
        </a>
      </div>
      {validateResult && (
        <div
          className={`rounded-md border p-3 text-sm ${
            validateResult.status === "verified"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : validateResult.status === "pending"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {validateResult.detail}
        </div>
      )}
    </Card>
  );
}
