import { describe, expect, it } from "vitest";
import { formatPaise, paise, parseRupees, sumPaiseBig } from "../src/money.js";

describe("money", () => {
  it("formats paise as rupees with Indian digit grouping", () => {
    expect(formatPaise(paise(12345678))).toBe("₹1,23,456.78");
  });

  it("parses a rupee string into paise", () => {
    expect(parseRupees("1,234.5")).toBe(123450);
  });

  it("rejects a non-integer paise value", () => {
    expect(() => paise(12.5)).toThrow(RangeError);
  });

  it("sums past 2^31 exactly as bigint", () => {
    const max = paise(2_147_483_647);
    expect(sumPaiseBig([max, max, paise(2)])).toBe(4_294_967_296n);
  });
});
