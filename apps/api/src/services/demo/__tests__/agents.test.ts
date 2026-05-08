import { describe, expect, it } from "vitest";
import { getDemoCatalog, getDemoByVertical } from "../agents";
import type { Bindings } from "../../../env";

function env(overrides: Partial<Record<string, string>> = {}): Bindings {
  return overrides as unknown as Bindings;
}

describe("getDemoCatalog", () => {
  it("returns empty array when no demo env vars set", () => {
    expect(getDemoCatalog(env())).toEqual([]);
  });

  it("includes Mario's Pizza when VAPI_DEMO_MARIOS_ASSISTANT_ID set", () => {
    const catalog = getDemoCatalog(env({ VAPI_DEMO_MARIOS_ASSISTANT_ID: "asst_mario" }));
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.vertical).toBe("restaurant");
    expect(catalog[0]?.assistant_id).toBe("asst_mario");
  });

  it("uses VAPI_DEMO_ASSISTANT_ID as backwards-compat Mario fallback", () => {
    const catalog = getDemoCatalog(env({ VAPI_DEMO_ASSISTANT_ID: "asst_legacy" }));
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.vertical).toBe("restaurant");
    expect(catalog[0]?.assistant_id).toBe("asst_legacy");
  });

  it("VAPI_DEMO_MARIOS_ASSISTANT_ID takes precedence over VAPI_DEMO_ASSISTANT_ID", () => {
    const catalog = getDemoCatalog(
      env({ VAPI_DEMO_MARIOS_ASSISTANT_ID: "asst_mario", VAPI_DEMO_ASSISTANT_ID: "asst_legacy" }),
    );
    expect(catalog[0]?.assistant_id).toBe("asst_mario");
  });

  it("includes salon when VAPI_DEMO_SALON_ASSISTANT_ID set", () => {
    const catalog = getDemoCatalog(env({ VAPI_DEMO_SALON_ASSISTANT_ID: "asst_salon" }));
    expect(catalog.some((a) => a.vertical === "salon")).toBe(true);
  });

  it("includes dental when VAPI_DEMO_DENTAL_ASSISTANT_ID set", () => {
    const catalog = getDemoCatalog(env({ VAPI_DEMO_DENTAL_ASSISTANT_ID: "asst_dental" }));
    expect(catalog.some((a) => a.vertical === "dental")).toBe(true);
  });

  it("includes auto when VAPI_DEMO_AUTO_ASSISTANT_ID set", () => {
    const catalog = getDemoCatalog(env({ VAPI_DEMO_AUTO_ASSISTANT_ID: "asst_auto" }));
    expect(catalog.some((a) => a.vertical === "auto")).toBe(true);
  });

  it("includes real_estate when VAPI_DEMO_REAL_ESTATE_ASSISTANT_ID set", () => {
    const catalog = getDemoCatalog(env({ VAPI_DEMO_REAL_ESTATE_ASSISTANT_ID: "asst_re" }));
    expect(catalog.some((a) => a.vertical === "real_estate")).toBe(true);
  });

  it("all verticals present when all env vars set", () => {
    const catalog = getDemoCatalog(
      env({
        VAPI_DEMO_MARIOS_ASSISTANT_ID: "a1",
        VAPI_DEMO_SALON_ASSISTANT_ID: "a2",
        VAPI_DEMO_DENTAL_ASSISTANT_ID: "a3",
        VAPI_DEMO_AUTO_ASSISTANT_ID: "a4",
        VAPI_DEMO_REAL_ESTATE_ASSISTANT_ID: "a5",
      }),
    );
    expect(catalog).toHaveLength(5);
  });

  it("each demo agent has sample_questions", () => {
    const catalog = getDemoCatalog(env({ VAPI_DEMO_MARIOS_ASSISTANT_ID: "asst_mario" }));
    expect(catalog[0]?.sample_questions.length).toBeGreaterThan(0);
  });
});

describe("getDemoByVertical", () => {
  it("returns null when catalog is empty", () => {
    expect(getDemoByVertical(env(), "restaurant")).toBeNull();
  });

  it("returns first entry when vertical is undefined", () => {
    const result = getDemoByVertical(
      env({ VAPI_DEMO_MARIOS_ASSISTANT_ID: "asst_mario" }),
      undefined,
    );
    expect(result?.vertical).toBe("restaurant");
  });

  it("returns matching vertical", () => {
    const e = env({
      VAPI_DEMO_MARIOS_ASSISTANT_ID: "a1",
      VAPI_DEMO_SALON_ASSISTANT_ID: "a2",
    });
    expect(getDemoByVertical(e, "salon")?.assistant_id).toBe("a2");
  });

  it("falls back to first entry when vertical not found", () => {
    const result = getDemoByVertical(
      env({ VAPI_DEMO_MARIOS_ASSISTANT_ID: "asst_mario" }),
      "dental",
    );
    expect(result?.assistant_id).toBe("asst_mario");
  });
});
