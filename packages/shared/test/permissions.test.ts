import { describe, expect, it } from "vitest";
import { can, permissionsFor } from "../src/permissions.js";

describe("permissions", () => {
  it("gives an owner members.manage", () => {
    expect(can(["owner"], "members.manage")).toBe(true);
  });

  it("does not give front desk members.manage", () => {
    expect(can(["front_desk"], "members.manage")).toBe(false);
  });

  it("gives a doctor-plus-owner role set the union of both", () => {
    expect(permissionsFor(["doctor", "owner"])).toEqual(
      new Set(["org.read", "members.read", "members.manage"]),
    );
  });
});
