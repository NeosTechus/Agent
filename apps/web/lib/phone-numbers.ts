import { apiGet, apiPost } from "./api-client";

export interface AvailableNumber {
  phoneNumber: string;
  friendlyName?: string;
  region?: string;
  locality?: string;
}

export function searchNumbers(area_code?: string): Promise<{ numbers: AvailableNumber[] }> {
  const qs = area_code ? `?area_code=${encodeURIComponent(area_code)}&limit=20` : "?limit=20";
  return apiGet(`/v1/phone-numbers/search${qs}`);
}

export function provisionNumber(input: {
  business_id: string;
  agent_id: string;
  area_code?: string;
}): Promise<{ business_id: string; phone_number: string | null; vapi_phone_number_id: string }> {
  return apiPost("/v1/phone-numbers/provision", input);
}

export interface CarrierLookup {
  carrier_name?: string;
  type?: string;
}

export function lookupCarrier(phone_number: string): Promise<CarrierLookup> {
  return apiPost("/v1/phone-numbers/lookup-carrier", { phone_number });
}
