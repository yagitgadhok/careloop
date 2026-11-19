import { describe, expect, it } from "vitest";
import { phoneSchema } from "../src/schemas/common.js";

describe("phoneSchema", () => {
  it.each(["9876543210", "+91 98765 43210", "09876543210", "+919876543210"])(
    "normalises %s to +91 E.164",
    (input) => {
      expect(phoneSchema.parse(input)).toBe("+919876543210");
    },
  );

  it("rejects a number from another country", () => {
    expect(phoneSchema.safeParse("+1 415 555 0123").success).toBe(false);
  });

  it("rejects a 9-digit number", () => {
    expect(phoneSchema.safeParse("987654321").success).toBe(false);
  });
});
