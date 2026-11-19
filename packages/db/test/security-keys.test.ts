import { describe, expect, it } from "vitest";
import { createSecurityKeys } from "../src/index.js";

const keys = createSecurityKeys({ phonePepper: "test-pepper-for-phone-hashing-0000" });

describe("security keys", () => {
  it("gives two spellings of the same phone the same hash and keys", () => {
    const a = keys.phoneHash("98765 43210");
    const b = keys.phoneHash("+91 98765 43210");
    expect(a).toBe(b);
    expect(keys.otp.failures(a, keys.ipHash("10.0.0.1"))).toBe(
      keys.otp.failures(b, keys.ipHash("10.0.0.1")),
    );
  });

  it("never puts phone digits or raw IPs in a hash or key", () => {
    const phoneHash = keys.phoneHash("9876543210");
    const ipHash = keys.ipHash("203.0.113.7");
    const all = [
      phoneHash,
      ipHash,
      keys.otp.failures(phoneHash, ipHash),
      keys.otp.lockout(phoneHash, ipHash),
      keys.otp.dailySends(phoneHash, ipHash),
      keys.otp.resendGap(phoneHash),
      keys.otp.phoneFailures(phoneHash),
      keys.otp.phoneSends(phoneHash),
      keys.otp.ipRequests(ipHash),
    ];
    for (const value of all) {
      expect(value).not.toMatch(/98765|43210|203\.0\.113/);
    }
  });

  it("gives different phones different hashes", () => {
    expect(keys.phoneHash("9876543210")).not.toBe(keys.phoneHash("9876543211"));
  });
});
