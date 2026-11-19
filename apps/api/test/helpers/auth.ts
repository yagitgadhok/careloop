import { randomInt } from "node:crypto";
import { createOrganisation, deleteOtpCounters, type Db, type SecurityKeys } from "@careloop/db";
import type { Redis } from "ioredis";
import type { Response } from "supertest";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../../src/auth/cookies.js";
import { OtpService } from "../../src/auth/otp.service.js";
import type { Clock } from "../../src/common/clock.js";
import { CLOCK, DB, REDIS, SECURITY_KEYS } from "../../src/infra/tokens.js";
import { createTestApp, type TestApp, type TestAppOptions } from "./app.js";

const OPERATOR_ID = "00000000-0000-4000-8000-0000000000cc";

/** A clock the test moves by hand. Starts at the real time. */
export class FakeClock implements Clock {
  private ms = Date.now();
  now(): Date {
    return new Date(this.ms);
  }
  advance(ms: number): void {
    this.ms += ms;
  }
}

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;

/** A made-up Indian mobile number, in the `+91 99` range. */
export function randomPhone(): string {
  return `+9199${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
}

/** A made-up client IP from the benchmarking range, so tests never share counters. */
export function randomIp(): string {
  return `198.${randomInt(18, 20)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

/** A six-digit code that differs from `code`. */
export function wrongCode(code: string): string {
  return String((Number(code) + 1) % 1_000_000).padStart(6, "0");
}

export interface AuthTestApp extends TestApp {
  clock: FakeClock;
  db: Db;
  redis: Redis;
  keys: SecurityKeys;
  /** POST JSON from the web origin, as a client at `ip`. */
  post(path: string, ip: string, body?: unknown, cookie?: string): Promise<Response>;
  get(path: string, cookie?: string, headers?: Record<string, string>): Promise<Response>;
  requestOtp(phone: string, ip: string): Promise<Response>;
  /** The code the test sender recorded for `phone`, after background sends finish. */
  lastCode(phone: string): Promise<string | null>;
  verify(phone: string, code: string, ip: string): Promise<Response>;
  /** Requests and verifies a code; returns the verify response and its cookie header. */
  signIn(phone: string, ip?: string): Promise<{ res: Response; cookie: string }>;
  /** Phones and IPs whose Redis counters are removed on close. */
  track(phone?: string, ip?: string): void;
}

export async function createAuthTestApp(options: TestAppOptions = {}): Promise<AuthTestApp> {
  const clock = new FakeClock();
  const t = await createTestApp({
    ...options,
    overrides: [...(options.overrides ?? []), { token: CLOCK, value: clock }],
  });
  const db = t.app.get<Db>(DB);
  const redis = t.app.get<Redis>(REDIS);
  const keys = t.app.get<SecurityKeys>(SECURITY_KEYS);
  const otp = t.app.get(OtpService);
  const phones = new Set<string>();
  const ips = new Set<string>();

  const track = (phone?: string, ip?: string) => {
    if (phone) phones.add(phone);
    if (ip) ips.add(ip);
  };

  const post = (path: string, ip: string, body?: unknown, cookie?: string) => {
    let req = t.http.post(path).set("origin", t.origin).set("x-forwarded-for", ip);
    if (cookie) req = req.set("cookie", cookie);
    return body === undefined ? req : req.send(body as object);
  };

  const get = (path: string, cookie?: string, headers: Record<string, string> = {}) => {
    let req = t.http.get(path);
    if (cookie) req = req.set("cookie", cookie);
    for (const [name, value] of Object.entries(headers)) req = req.set(name, value);
    return req;
  };

  const requestOtp = (phone: string, ip: string) => {
    track(phone, ip);
    return post("/api/auth/otp/request", ip, { phone });
  };

  const lastCode = async (phone: string) => {
    await otp.whenIdle();
    return redis.get(keys.otp.testCode(keys.phoneHash(phone)));
  };

  const verify = (phone: string, code: string, ip: string) => {
    track(phone, ip);
    return post("/api/auth/otp/verify", ip, { phone, code });
  };

  const signIn = async (phone: string, ip = randomIp()) => {
    const requested = await requestOtp(phone, ip);
    if (requested.status !== 200) throw new Error(`OTP request failed: ${requested.status}`);
    const code = await lastCode(phone);
    if (!code) throw new Error("No code was sent");
    const res = await verify(phone, code, ip);
    if (res.status !== 200) throw new Error(`Verify failed: ${res.status}`);
    return { res, cookie: cookieHeader(res) };
  };

  const close = async () => {
    await otp.whenIdle();
    const doomed: string[] = [];
    for (const phone of phones) {
      const hash = keys.phoneHash(phone);
      await deleteOtpCounters(redis, keys, hash);
      doomed.push(keys.otp.testCode(hash));
    }
    for (const ip of ips) doomed.push(keys.otp.ipRequests(keys.ipHash(ip)));
    if (doomed.length) await redis.del(...doomed);
    await t.close();
  };

  return {
    ...t,
    clock,
    db,
    redis,
    keys,
    post,
    get,
    requestOtp,
    lastCode,
    verify,
    signIn,
    track,
    close,
  };
}

/** Creates a made-up clinic owned by `ownerPhone` (creating the user if needed). */
export async function createClinic(db: Db, ownerPhone: string, name = "Test clinic") {
  return createOrganisation(db, {
    name,
    locationName: "Main",
    ownerPhone,
    operatorId: OPERATOR_ID,
  });
}

/** The raw Set-Cookie lines of a response. */
export function setCookies(res: Response): string[] {
  const header = res.headers["set-cookie"] as unknown;
  if (!header) return [];
  return Array.isArray(header) ? (header as string[]) : [String(header)];
}

/** The value a response set for one cookie, or undefined ("" when it was cleared). */
export function cookieValue(res: Response, name: string): string | undefined {
  for (const line of setCookies(res)) {
    const [pair] = line.split(";");
    const eq = pair?.indexOf("=") ?? -1;
    if (pair && eq > 0 && pair.slice(0, eq) === name) return pair.slice(eq + 1);
  }
  return undefined;
}

/** A Cookie request header carrying the auth cookies a response set. */
export function cookieHeader(res: Response, previous?: string): string {
  const jar = new Map<string, string>();
  for (const part of (previous ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
    const value = cookieValue(res, name);
    if (value !== undefined) jar.set(name, value);
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

/** Status and body, minus the per-request id, for comparing response sequences. */
export function shape(res: Response): { status: number; body: unknown } {
  const body = { ...(res.body as Record<string, unknown>) };
  delete body["requestId"];
  return { status: res.status, body };
}
