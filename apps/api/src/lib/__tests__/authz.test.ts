import { describe, expect, it } from "vitest";
import { requireRole, ROLES } from "../authz";

function makeCtx(role: string | undefined) {
  const vars: Record<string, unknown> = {};
  if (role !== undefined) vars["role"] = role;
  let nextCalled = false;
  const c = {
    get: (k: string) => vars[k],
    set: (k: string, v: unknown) => { vars[k] = v; },
  } as unknown as Parameters<ReturnType<typeof requireRole>>[0];
  const next = async () => { nextCalled = true; };
  return { c, next: () => next(), isNextCalled: () => nextCalled };
}

describe("requireRole", () => {
  it("throws when allowed list is empty", () => {
    expect(() => requireRole([])).toThrow("requireRole called with empty allowed list");
  });

  it("throws 401 when role is not set", async () => {
    const mw = requireRole(["owner"]);
    const { c, next } = makeCtx(undefined);
    await expect(mw(c, next)).rejects.toMatchObject({ status: 401 });
  });

  it("throws 403 when role is not in allowed list", async () => {
    const mw = requireRole(["owner", "manager"]);
    const { c, next } = makeCtx("staff");
    await expect(mw(c, next)).rejects.toMatchObject({ status: 403 });
  });

  it("calls next() when role is allowed", async () => {
    const mw = requireRole(["owner", "manager"]);
    const { c, next, isNextCalled } = makeCtx("manager");
    await mw(c, next);
    expect(isNextCalled()).toBe(true);
  });

  it("allows owner when owner is in list", async () => {
    const mw = requireRole(["owner"]);
    const { c, next, isNextCalled } = makeCtx("owner");
    await mw(c, next);
    expect(isNextCalled()).toBe(true);
  });

  it("ROLES constant contains all four roles", () => {
    expect(ROLES).toContain("owner");
    expect(ROLES).toContain("manager");
    expect(ROLES).toContain("staff");
    expect(ROLES).toContain("viewer");
  });
});
