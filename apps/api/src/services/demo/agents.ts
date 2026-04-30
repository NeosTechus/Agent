// Per-vertical demo agent catalog.
//
// Each entry maps a homepage demo `vertical` to a Vapi assistant id +
// short personalization metadata. The assistants are pre-provisioned in
// Vapi (one per vertical) and their IDs are stored in env vars so we can
// rotate without code changes.
//
// V1 ships Mario's Pizza only — enabled when `VAPI_DEMO_MARIOS_ASSISTANT_ID`
// is set. Additional verticals come online as they're configured.

import type { Bindings } from "../../env";

export type DemoVertical =
  | "restaurant"
  | "salon"
  | "dental"
  | "auto"
  | "real_estate";

export interface DemoAgent {
  vertical: DemoVertical;
  display_name: string;
  description: string;
  assistant_id: string;
  // Optional sample questions surfaced by the homepage UI to nudge first-time
  // visitors into a productive call.
  sample_questions: string[];
}

export function getDemoCatalog(env: Bindings): DemoAgent[] {
  const out: DemoAgent[] = [];
  if (env.VAPI_DEMO_MARIOS_ASSISTANT_ID) {
    out.push({
      vertical: "restaurant",
      display_name: "Mario's Pizza",
      description: "A neighborhood Italian restaurant in Brooklyn.",
      assistant_id: env.VAPI_DEMO_MARIOS_ASSISTANT_ID,
      sample_questions: [
        "What time do you close on Saturday?",
        "Can I book a table for 4 at 7pm?",
        "Do you have gluten-free pizza?",
      ],
    });
  } else if (env.VAPI_DEMO_ASSISTANT_ID) {
    // Backwards-compat: the original single-assistant env var maps to Mario.
    out.push({
      vertical: "restaurant",
      display_name: "Mario's Pizza",
      description: "A neighborhood Italian restaurant in Brooklyn.",
      assistant_id: env.VAPI_DEMO_ASSISTANT_ID,
      sample_questions: [
        "What time do you close on Saturday?",
        "Can I book a table for 4 at 7pm?",
        "Do you have gluten-free pizza?",
      ],
    });
  }
  if (env.VAPI_DEMO_SALON_ASSISTANT_ID) {
    out.push({
      vertical: "salon",
      display_name: "Sandra's Salon",
      description: "An upscale hair salon in Austin.",
      assistant_id: env.VAPI_DEMO_SALON_ASSISTANT_ID,
      sample_questions: [
        "Do you do balayage?",
        "Can I book a haircut tomorrow at 2?",
        "How much does a single-process color cost?",
      ],
    });
  }
  if (env.VAPI_DEMO_DENTAL_ASSISTANT_ID) {
    out.push({
      vertical: "dental",
      display_name: "Dr. Lee's Dental",
      description: "A family dentistry practice in Seattle.",
      assistant_id: env.VAPI_DEMO_DENTAL_ASSISTANT_ID,
      sample_questions: [
        "Do you accept Delta Dental?",
        "I need a cleaning — when's your next opening?",
        "Do you do same-day emergency visits?",
      ],
    });
  }
  if (env.VAPI_DEMO_AUTO_ASSISTANT_ID) {
    out.push({
      vertical: "auto",
      display_name: "Quick Lube Auto",
      description: "A neighborhood auto-service shop.",
      assistant_id: env.VAPI_DEMO_AUTO_ASSISTANT_ID,
      sample_questions: [
        "Can I get an oil change without an appointment?",
        "How long does a brake job take?",
        "Do you do state inspections?",
      ],
    });
  }
  if (env.VAPI_DEMO_REAL_ESTATE_ASSISTANT_ID) {
    out.push({
      vertical: "real_estate",
      display_name: "Pacific Realty",
      description: "A boutique real estate brokerage.",
      assistant_id: env.VAPI_DEMO_REAL_ESTATE_ASSISTANT_ID,
      sample_questions: [
        "What's the average price per square foot in this neighborhood?",
        "Can I schedule a showing this weekend?",
        "Do you handle commercial properties?",
      ],
    });
  }
  return out;
}

export function getDemoByVertical(
  env: Bindings,
  vertical: DemoVertical | undefined,
): DemoAgent | null {
  const catalog = getDemoCatalog(env);
  if (!vertical) return catalog[0] ?? null;
  return catalog.find((a) => a.vertical === vertical) ?? catalog[0] ?? null;
}
