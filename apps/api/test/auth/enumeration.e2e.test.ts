import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAuthTestApp,
  createClinic,
  randomIp,
  randomPhone,
  SECOND,
  shape,
  type AuthTestApp,
} from "../helpers/auth.js";

let t: AuthTestApp;

beforeAll(async () => {
  t = await createAuthTestApp();
});

afterAll(async () => {
  await t.close();
});

async function challengeCount(phone: string): Promise<number> {
  return t.db.withSystem("auth", (sys) => sys.otpChallenge.count({ where: { user: { phone } } }));
}

describe("registered and unregistered phones look the same", () => {
  it("gives identical responses to twelve consecutive code requests, and only the registered phone gets a code", async () => {
    const registered = randomPhone();
    await createClinic(t.db, registered);
    const unregistered = randomPhone();
    const ipA = randomIp();
    const ipB = randomIp();

    const seqA: unknown[] = [];
    const seqB: unknown[] = [];
    for (let i = 0; i < 12; i++) {
      seqA.push(shape(await t.requestOtp(registered, ipA)));
      seqB.push(shape(await t.requestOtp(unregistered, ipB)));
      // Some requests land inside the 30-second resend gap, some outside it.
      t.clock.advance((i % 2 === 0 ? 10 : 31) * SECOND);
    }
    expect(seqA).toEqual(seqB);
    expect(seqA.some((r) => (r as { status: number }).status === 429)).toBe(true);

    expect(await t.lastCode(registered)).toMatch(/^\d{6}$/);
    expect(await t.lastCode(unregistered)).toBeNull();
    expect(await challengeCount(registered)).toBeGreaterThan(0);
    expect(await challengeCount(unregistered)).toBe(0);
  });

  it("gives identical responses to seven wrong codes, including the lockout", async () => {
    const registered = randomPhone();
    await createClinic(t.db, registered);
    const unregistered = randomPhone();
    const ipA = randomIp();
    const ipB = randomIp();
    await t.requestOtp(registered, ipA);
    await t.requestOtp(unregistered, ipB);
    await t.lastCode(registered);

    const seqA: unknown[] = [];
    const seqB: unknown[] = [];
    for (let i = 0; i < 7; i++) {
      seqA.push(shape(await t.verify(registered, "000000", ipA)));
      seqB.push(shape(await t.verify(unregistered, "000000", ipB)));
    }
    expect(seqA).toEqual(seqB);
    expect(seqA.at(-1)).toEqual({ status: 429, body: { code: "rate_limited" } });
  });
});
