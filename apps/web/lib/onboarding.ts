import { apiGet, apiPost } from "./api-client";

export interface BusinessState {
  id: string;
  organization_id: string;
  business_name: string;
  vertical: string | null;
  address: string | null;
  hours_json: string | null;
  existing_phone_number: string | null;
  twilio_forwarding_number: string | null;
  vapi_phone_number_id: string | null;
}

export function getOnboardingState(): Promise<{ business: BusinessState | null }> {
  return apiGet("/v1/onboarding/state");
}

export function saveBusiness(input: {
  business_name: string;
  vertical: string;
  address?: string;
  hours_json?: string;
  existing_phone_number?: string;
  timezone?: string;
}): Promise<{ business: BusinessState }> {
  return apiPost("/v1/onboarding/business", input);
}

export const US_TIMEZONES = [
  { id: "America/New_York", label: "Eastern (ET)" },
  { id: "America/Chicago", label: "Central (CT)" },
  { id: "America/Denver", label: "Mountain (MT)" },
  { id: "America/Phoenix", label: "Arizona (no DST)" },
  { id: "America/Los_Angeles", label: "Pacific (PT)" },
  { id: "America/Anchorage", label: "Alaska (AKT)" },
  { id: "Pacific/Honolulu", label: "Hawaii (HT)" },
];

export function guessUserTimezone(): string {
  if (typeof Intl === "undefined") return "America/New_York";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

export function validateForwarding(
  business_id: string,
): Promise<{ status: "pending" | "verified" | "failed"; detail: string }> {
  return apiPost("/v1/onboarding/forwarding/validate", { business_id });
}

export const CARRIER_FORWARDING_INSTRUCTIONS: Record<
  string,
  { label: string; steps: string[] }
> = {
  att: {
    label: "AT&T",
    steps: [
      "Open your phone app and dial **21*<our_number>#**",
      "Press call. You'll hear a short tone confirming forwarding is on.",
      "To turn off forwarding later: dial **#21#** and press call.",
    ],
  },
  verizon: {
    label: "Verizon",
    steps: [
      "From the business line, dial *72 and then our number, then press call.",
      "To deactivate later: dial *73 and press call.",
    ],
  },
  tmobile: {
    label: "T-Mobile",
    steps: [
      "Dial **21*<our_number>#** and press call.",
      "To turn off: dial **##21#** and press call.",
    ],
  },
  comcast: {
    label: "Comcast / Xfinity Voice",
    steps: [
      "Sign in to xfinity.com/voice and select 'Call Forwarding Always'.",
      "Enter our number and save.",
    ],
  },
  spectrum: {
    label: "Spectrum",
    steps: [
      "Sign in to spectrum.net Voice Manager.",
      "Set 'Forward All Calls' to our number.",
    ],
  },
  vonage: {
    label: "Vonage",
    steps: [
      "Sign in at my.vonage.com.",
      "Phone Features → Call Forwarding → enter our number → save.",
    ],
  },
  ringcentral: {
    label: "RingCentral",
    steps: [
      "Sign in to RingCentral admin.",
      "Phone System → Phones & Numbers → select line → Call Handling → forward to our number.",
    ],
  },
  unknown: {
    label: "Other / Unknown",
    steps: [
      "Most US carriers support universal call-forward codes.",
      "Try **21*<our_number>#** to enable, **#21#** to disable.",
      "Contact your phone provider's support if these codes don't work.",
    ],
  },
};

export function carrierKey(carrierName: string | null | undefined): string {
  if (!carrierName) return "unknown";
  const n = carrierName.toLowerCase();
  if (n.includes("at&t") || n.includes("at and t")) return "att";
  if (n.includes("verizon")) return "verizon";
  if (n.includes("t-mobile") || n.includes("tmobile") || n.includes("sprint")) return "tmobile";
  if (n.includes("comcast") || n.includes("xfinity")) return "comcast";
  if (n.includes("spectrum") || n.includes("charter")) return "spectrum";
  if (n.includes("vonage")) return "vonage";
  if (n.includes("ringcentral")) return "ringcentral";
  return "unknown";
}
