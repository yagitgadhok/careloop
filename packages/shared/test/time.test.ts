import { describe, expect, it } from "vitest";
import { formatIst, formatPlainDate, parsePlainDate } from "../src/time.js";

describe("time", () => {
  it("displays a UTC instant in Asia/Kolkata", () => {
    const shown = formatIst(new Date("2026-03-31T18:45:00Z"));
    expect(shown).toContain("1 April 2026");
    expect(shown).toContain("00:15");
    expect(shown).toContain("IST");
  });

  it("round-trips a plain-date DOB without shifting", () => {
    const dob = parsePlainDate("1990-01-01");
    expect(dob).toBe("1990-01-01");
    expect(formatPlainDate(dob)).toBe("1 January 1990");
  });
});
