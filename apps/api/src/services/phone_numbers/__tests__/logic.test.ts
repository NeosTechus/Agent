import { describe, expect, it, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { searchNumbers, lookupCarrier, provisionNumber, releaseNumber } from "../logic";
import type { Bindings } from "../../../env";

const TWILIO_BASE = "https://api.twilio.com/2010-04-01/";
const TWILIO_LOOKUP = "https://lookups.twilio.com/v2/";
const VAPI_BASE = "https://api.vapi.ai/";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeEnv(overrides: Partial<Record<string, unknown>> = {}): Bindings {
  return {
    TWILIO_ACCOUNT_SID: "ACtest",
    TWILIO_AUTH_TOKEN: "tok",
    VAPI_API_KEY: "vapi-key",
    DB: makeDb(),
    ...overrides,
  } as unknown as Bindings;
}

function makeDb(opts: { agentRow?: unknown; businessRow?: unknown; businessFullRow?: unknown } = {}) {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first<T>() {
              if (sql.includes("FROM agents")) return (opts.agentRow ?? null) as T;
              if (sql.includes("vapi_phone_number_id")) return (opts.businessFullRow ?? null) as T;
              if (sql.includes("FROM businesses")) return (opts.businessRow ?? null) as T;
              return null as T;
            },
            async run() { return { success: true }; },
          };
        },
      };
    },
  };
}

describe("searchNumbers", () => {
  it("throws when Twilio not configured", async () => {
    const env = makeEnv({ TWILIO_ACCOUNT_SID: undefined });
    await expect(searchNumbers(env, "415", 5)).rejects.toMatchObject({ status: 503 });
  });

  it("returns numbers from Twilio", async () => {
    server.use(
      http.get(`${TWILIO_BASE}Accounts/ACtest/AvailablePhoneNumbers/US/Local.json`, () =>
        HttpResponse.json({
          available_phone_numbers: [
            {
              phone_number: "+14155550100",
              friendly_name: "(415) 555-0100",
              locality: "SF",
              region: "CA",
              iso_country: "US",
              capabilities: { voice: true, SMS: true, MMS: false },
            },
          ],
        }),
      ),
    );
    const result = await searchNumbers(makeEnv(), "415", 5);
    expect(result.numbers).toHaveLength(1);
    expect(result.numbers[0]?.phoneNumber).toBe("+14155550100");
  });
});

describe("lookupCarrier", () => {
  it("throws when Twilio not configured", async () => {
    const env = makeEnv({ TWILIO_AUTH_TOKEN: undefined });
    await expect(lookupCarrier(env, "+14155550100")).rejects.toMatchObject({ status: 503 });
  });

  it("returns carrier info", async () => {
    server.use(
      http.get(`${TWILIO_LOOKUP}PhoneNumbers/%2B14155550100`, () =>
        HttpResponse.json({
          phone_number: "+14155550100",
          country_code: "US",
          line_type_intelligence: { carrier_name: "AT&T", type: "mobile" },
        }),
      ),
    );
    const result = await lookupCarrier(makeEnv(), "+14155550100");
    expect(result.carrierName).toBe("AT&T");
  });
});

describe("provisionNumber", () => {
  it("throws 404 when agent not found", async () => {
    const env = makeEnv({ DB: makeDb({ agentRow: null }) });
    await expect(
      provisionNumber(env, "org_01", { business_id: "biz_01", agent_id: "agt_01" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 500 when agent has no vapi_assistant_id", async () => {
    const env = makeEnv({
      DB: makeDb({ agentRow: { id: "agt_01", vapi_assistant_id: null } }),
    });
    await expect(
      provisionNumber(env, "org_01", { business_id: "biz_01", agent_id: "agt_01" }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("throws 404 when business not found", async () => {
    const env = makeEnv({
      DB: makeDb({
        agentRow: { id: "agt_01", vapi_assistant_id: "vasst_1" },
        businessRow: null,
      }),
    });
    await expect(
      provisionNumber(env, "org_01", { business_id: "biz_01", agent_id: "agt_01" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 409 when business already has a number", async () => {
    const env = makeEnv({
      DB: makeDb({
        agentRow: { id: "agt_01", vapi_assistant_id: "vasst_1" },
        businessRow: { id: "biz_01", twilio_forwarding_number: "+14155550100" },
      }),
    });
    await expect(
      provisionNumber(env, "org_01", { business_id: "biz_01", agent_id: "agt_01" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("provisions and returns number when Vapi succeeds", async () => {
    server.use(
      http.post(`${VAPI_BASE}phone-number`, () =>
        HttpResponse.json({ id: "vpn_abc", number: "+14155550200" }),
      ),
    );
    const env = makeEnv({
      DB: makeDb({
        agentRow: { id: "agt_01", vapi_assistant_id: "vasst_1" },
        businessRow: { id: "biz_01", twilio_forwarding_number: null },
      }),
    });
    const result = await provisionNumber(env, "org_01", {
      business_id: "biz_01",
      agent_id: "agt_01",
      area_code: "415",
    });
    expect(result.phone_number).toBe("+14155550200");
    expect(result.vapi_phone_number_id).toBe("vpn_abc");
  });
});

describe("releaseNumber", () => {
  it("throws 404 when business not found", async () => {
    const env = makeEnv({ DB: makeDb({ businessRow: null }) });
    await expect(releaseNumber(env, "org_01", "biz_01")).rejects.toMatchObject({ status: 404 });
  });

  it("returns released=false when no number to release", async () => {
    const env = makeEnv({
      DB: makeDb({ businessRow: { id: "biz_01", twilio_forwarding_number: null } }),
    });
    const result = await releaseNumber(env, "org_01", "biz_01");
    expect(result.released).toBe(false);
  });

  it("releases Vapi number and clears DB when number exists", async () => {
    server.use(
      http.delete(`${VAPI_BASE}phone-number/vpn_abc`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    const env = makeEnv({
      DB: makeDb({
        businessRow: { id: "biz_01", twilio_forwarding_number: "+14155550200" },
        businessFullRow: { vapi_phone_number_id: "vpn_abc" },
      }),
    });
    const result = await releaseNumber(env, "org_01", "biz_01");
    expect(result.released).toBe(true);
  });

  it("returns released=true when number exists but no vapi_phone_number_id", async () => {
    const env = makeEnv({
      DB: makeDb({
        businessRow: { id: "biz_01", twilio_forwarding_number: "+14155550200" },
        businessFullRow: { vapi_phone_number_id: null },
      }),
    });
    const result = await releaseNumber(env, "org_01", "biz_01");
    expect(result.released).toBe(true);
  });
});
