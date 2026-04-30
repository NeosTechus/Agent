import { describe, expect, it } from "vitest";
import { namespaceFor } from "../logic";

describe("namespaceFor", () => {
  it("scopes by org and business", () => {
    expect(namespaceFor("org_1", "biz_a")).toBe("org:org_1:biz:biz_a");
  });
  it("differs when business changes", () => {
    expect(namespaceFor("org_1", "biz_a")).not.toBe(namespaceFor("org_1", "biz_b"));
  });
});
