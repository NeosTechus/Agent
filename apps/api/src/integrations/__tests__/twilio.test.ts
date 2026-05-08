import { describe, expect, it, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { TwilioClient, TwilioError } from "../twilio";

const BASE = "https://api.twilio.test/2010-04-01/";
const LOOKUP_BASE = "https://lookups.twilio.test/v2/";
const SID = "ACtest";
const TOKEN = "authtoken";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeClient() {
  return new TwilioClient({ accountSid: SID, authToken: TOKEN, baseUrl: BASE, lookupBaseUrl: LOOKUP_BASE });
}

describe("TwilioClient.searchAvailableNumbers", () => {
  it("returns mapped available numbers", async () => {
    server.use(
      http.get(`${BASE}Accounts/${SID}/AvailablePhoneNumbers/US/Local.json`, () =>
        HttpResponse.json({
          available_phone_numbers: [
            {
              phone_number: "+14155550100",
              friendly_name: "(415) 555-0100",
              locality: "San Francisco",
              region: "CA",
              iso_country: "US",
              capabilities: { voice: true, SMS: true, MMS: false },
            },
          ],
        }),
      ),
    );
    const client = makeClient();
    const result = await client.searchAvailableNumbers({ areaCode: "415", country: "US" });
    expect(result).toHaveLength(1);
    expect(result[0]?.phoneNumber).toBe("+14155550100");
    expect(result[0]?.capabilities.sms).toBe(true);
    expect(result[0]?.capabilities.mms).toBe(false);
  });

  it("throws TwilioError on 4xx response", async () => {
    server.use(
      http.get(`${BASE}Accounts/${SID}/AvailablePhoneNumbers/US/Local.json`, () =>
        HttpResponse.json({ message: "Not authorized", code: 20003 }, { status: 401 }),
      ),
    );
    const client = makeClient();
    await expect(client.searchAvailableNumbers({})).rejects.toBeInstanceOf(TwilioError);
  });
});

describe("TwilioClient.purchaseNumber", () => {
  it("returns purchased number", async () => {
    server.use(
      http.post(`${BASE}Accounts/${SID}/IncomingPhoneNumbers.json`, () =>
        HttpResponse.json({
          sid: "PN123",
          phone_number: "+14155550200",
          friendly_name: "My Number",
          capabilities: { voice: true, sms: false, mms: false },
        }),
      ),
    );
    const result = await makeClient().purchaseNumber({ phoneNumber: "+14155550200" });
    expect(result.sid).toBe("PN123");
    expect(result.phoneNumber).toBe("+14155550200");
  });
});

describe("TwilioClient.releaseNumber", () => {
  it("resolves without error on 204", async () => {
    server.use(
      http.delete(`${BASE}Accounts/${SID}/IncomingPhoneNumbers/PN456.json`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    await expect(makeClient().releaseNumber("PN456")).resolves.toBeUndefined();
  });

  it("throws on 404", async () => {
    server.use(
      http.delete(`${BASE}Accounts/${SID}/IncomingPhoneNumbers/PN_BAD.json`, () =>
        HttpResponse.json({ message: "Not found", code: 20404 }, { status: 404 }),
      ),
    );
    const err = await makeClient().releaseNumber("PN_BAD").catch((e) => e);
    expect(err).toBeInstanceOf(TwilioError);
    expect((err as TwilioError).statusCode).toBe(404);
  });
});

describe("TwilioClient.lookupCarrier", () => {
  it("returns carrier info", async () => {
    server.use(
      http.get(`${LOOKUP_BASE}PhoneNumbers/%2B14155550100`, () =>
        HttpResponse.json({
          phone_number: "+14155550100",
          country_code: "US",
          line_type_intelligence: { carrier_name: "Verizon", type: "mobile" },
        }),
      ),
    );
    const result = await makeClient().lookupCarrier("+14155550100");
    expect(result.carrierName).toBe("Verizon");
    expect(result.type).toBe("mobile");
  });

  it("handles missing line_type_intelligence", async () => {
    server.use(
      http.get(`${LOOKUP_BASE}PhoneNumbers/%2B14155550100`, () =>
        HttpResponse.json({ phone_number: "+14155550100", country_code: "US" }),
      ),
    );
    const result = await makeClient().lookupCarrier("+14155550100");
    expect(result.carrierName).toBeNull();
    expect(result.type).toBeNull();
  });
});

describe("TwilioClient.sendSms", () => {
  it("returns sent SMS info", async () => {
    server.use(
      http.post(`${BASE}Accounts/${SID}/Messages.json`, () =>
        HttpResponse.json({
          sid: "SM123",
          status: "queued",
          to: "+14155550100",
          from: "+14155550200",
        }),
      ),
    );
    const result = await makeClient().sendSms({
      to: "+14155550100",
      from: "+14155550200",
      body: "Hello",
    });
    expect(result.sid).toBe("SM123");
    expect(result.status).toBe("queued");
  });
});

describe("TwilioClient.verifyWebhookSignature", () => {
  it("returns false when signature is missing", async () => {
    const result = await makeClient().verifyWebhookSignature(
      "https://example.com/webhook",
      {},
      null,
      "secret",
    );
    expect(result).toBe(false);
  });

  it("returns false for wrong signature", async () => {
    const result = await makeClient().verifyWebhookSignature(
      "https://example.com/webhook",
      { Body: "hello" },
      "wrongsig",
      "secret",
    );
    expect(result).toBe(false);
  });
});
