import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConsoleOtpSender } from "../../src/auth/console-otp-sender.js";
import { createOtpSender } from "../../src/auth/otp-sender.js";
import { TestOtpSender } from "../../src/auth/test-otp-sender.js";
import {
  createAuthTestApp,
  createClinic,
  MINUTE,
  randomIp,
  randomPhone,
  SECOND,
  wrongCode,
  type AuthTestApp,
} from "../helpers/auth.js";

let t: AuthTestApp;

beforeAll(async () => {
  t = await createAuthTestApp();
});

afterAll(async () => {
  await t.close();
});

async function registeredPhone(): Promise<string> {
  const phone = randomPhone();
  await createClinic(t.db, phone);
  return phone;
}

describe("OTP codes", () => {
  it("signs in with the right code within 5 minutes, and the same code does not work twice", async () => {
    const phone = await registeredPhone();
    const ip = randomIp();
    expect((await t.requestOtp(phone, ip)).status).toBe(200);
    const code = await t.lastCode(phone);
    expect(code).toMatch(/^\d{6}$/);

    t.clock.advance(4 * MINUTE + 59 * SECOND);
    const first = await t.verify(phone, code ?? "", ip);
    expect(first.status).toBe(200);

    const again = await t.verify(phone, code ?? "", ip);
    expect(again.status).toBe(400);
    expect(again.body.code).toBe("invalid_code");
  });

  it("rejects a code at 5 minutes and 1 second", async () => {
    const phone = await registeredPhone();
    const ip = randomIp();
    await t.requestOtp(phone, ip);
    const code = (await t.lastCode(phone)) ?? "";

    t.clock.advance(5 * MINUTE + SECOND);
    const res = await t.verify(phone, code, ip);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("invalid_code");
  });

  it("rejects the earlier code after a resend", async () => {
    const phone = await registeredPhone();
    const ip = randomIp();
    await t.requestOtp(phone, ip);
    const first = (await t.lastCode(phone)) ?? "";
    t.clock.advance(31 * SECOND);
    await t.requestOtp(phone, ip);
    const second = (await t.lastCode(phone)) ?? "";

    if (first !== second) {
      expect((await t.verify(phone, first, ip)).body.code).toBe("invalid_code");
    }
    expect((await t.verify(phone, second, ip)).status).toBe(200);
  });
});

describe("lockout", () => {
  it("locks a phone for one IP after five wrong attempts, across a resend, for 15 minutes", async () => {
    const phone = await registeredPhone();
    const ip = randomIp();
    await t.requestOtp(phone, ip);
    let code = (await t.lastCode(phone)) ?? "";
    for (let i = 0; i < 3; i++) {
      expect((await t.verify(phone, wrongCode(code), ip)).status).toBe(400);
    }
    t.clock.advance(31 * SECOND);
    await t.requestOtp(phone, ip);
    code = (await t.lastCode(phone)) ?? "";
    for (let i = 0; i < 2; i++) {
      expect((await t.verify(phone, wrongCode(code), ip)).status).toBe(400);
    }

    const locked = await t.verify(phone, code, ip);
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe("rate_limited");

    // A fresh code is still refused from this IP while the lock lasts...
    t.clock.advance(14 * MINUTE + 50 * SECOND);
    await t.requestOtp(phone, ip);
    code = (await t.lastCode(phone)) ?? "";
    expect((await t.verify(phone, code, ip)).status).toBe(429);

    // ...and accepted once 15 minutes have passed.
    t.clock.advance(15 * SECOND);
    expect((await t.verify(phone, code, ip)).status).toBe(200);
  });

  it("records at most five attempts from ten parallel wrong guesses", async () => {
    const phone = await registeredPhone();
    const ip = randomIp();
    await t.requestOtp(phone, ip);
    const code = (await t.lastCode(phone)) ?? "";

    const results = await Promise.all(
      Array.from({ length: 10 }, () => t.verify(phone, wrongCode(code), ip)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 400)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(5);
    const phoneFailures = await t.redis.get(t.keys.otp.phoneFailures(t.keys.phoneHash(phone)));
    expect(Number(phoneFailures)).toBe(5);
  });

  it("does not stop the phone signing in from another IP when one IP exhausts its lockout and send cap", async () => {
    const phone = await registeredPhone();
    const attacker = randomIp();
    for (let i = 0; i < 10; i++) {
      expect((await t.requestOtp(phone, attacker)).status).toBe(200);
      t.clock.advance(31 * SECOND);
    }
    expect((await t.requestOtp(phone, attacker)).status).toBe(429);
    const code = (await t.lastCode(phone)) ?? "";
    for (let i = 0; i < 5; i++) await t.verify(phone, wrongCode(code), attacker);
    expect((await t.verify(phone, code, attacker)).status).toBe(429);

    t.clock.advance(31 * SECOND);
    const staff = randomIp();
    expect((await t.requestOtp(phone, staff)).status).toBe(200);
    const fresh = (await t.lastCode(phone)) ?? "";
    expect((await t.verify(phone, fresh, staff)).status).toBe(200);
  });

  it("stops guessing spread across many IPs with the per-phone backstop", async () => {
    const phone = await registeredPhone();
    await t.requestOtp(phone, randomIp());
    const code = (await t.lastCode(phone)) ?? "";
    for (let i = 0; i < 4; i++) {
      const ip = randomIp();
      for (let j = 0; j < 5; j++) {
        expect((await t.verify(phone, wrongCode(code), ip)).status).toBe(400);
      }
    }
    const res = await t.verify(phone, code, randomIp());
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("rate_limited");
  });
});

describe("send limits", () => {
  it("rejects a resend within 30 seconds", async () => {
    const phone = await registeredPhone();
    const ip = randomIp();
    expect((await t.requestOtp(phone, ip)).status).toBe(200);
    t.clock.advance(29 * SECOND);
    const res = await t.requestOtp(phone, ip);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("rate_limited");
  });

  it("rejects the 11th send in a day from one IP", async () => {
    const phone = await registeredPhone();
    const ip = randomIp();
    for (let i = 0; i < 10; i++) {
      expect((await t.requestOtp(phone, ip)).status).toBe(200);
      t.clock.advance(31 * SECOND);
    }
    expect((await t.requestOtp(phone, ip)).status).toBe(429);
  });

  it("limits one IP across different phones", async () => {
    const ip = randomIp();
    for (let i = 0; i < 60; i++) {
      expect((await t.requestOtp(randomPhone(), ip)).status).toBe(200);
    }
    const res = await t.requestOtp(randomPhone(), ip);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("rate_limited");
  });
});

describe("development senders", () => {
  it.each(["staging", "production"] as const)("refuse to start under APP_ENV=%s", (APP_ENV) => {
    expect(() => new ConsoleOtpSender({ APP_ENV })).toThrow();
    expect(() => new TestOtpSender({ APP_ENV }, t.redis, t.keys)).toThrow();
    expect(() => createOtpSender({ APP_ENV }, t.redis, t.keys)).toThrow();
  });
});
