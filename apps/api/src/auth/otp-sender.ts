import type { SecurityKeys } from "@careloop/db";
import type { Redis } from "ioredis";
import type { Env } from "../config/env.js";
import { ConsoleOtpSender } from "./console-otp-sender.js";
import { TestOtpSender } from "./test-otp-sender.js";

/** Delivers a sign-in code to a phone. Implementations never log the code or the number. */
export interface OtpSender {
  /** `phone` is E.164 (`+91XXXXXXXXXX`). */
  send(phone: string, code: string): Promise<void>;
}

export const OTP_SENDER = Symbol("OTP_SENDER");

/** Throws unless APP_ENV allows a development sender. */
export function assertDevelopmentSender(env: Pick<Env, "APP_ENV">, name: string): void {
  if (env.APP_ENV !== "local" && env.APP_ENV !== "test") {
    throw new Error(`${name} can only run when APP_ENV is local or test`);
  }
}

/**
 * Picks the sender for this environment at start-up. Staging and production
 * have no SMS sender yet (DLT registration is pending), so the API refuses to
 * start there rather than silently dropping codes.
 */
export function createOtpSender(
  env: Pick<Env, "APP_ENV">,
  redis: Redis,
  keys: SecurityKeys,
): OtpSender {
  switch (env.APP_ENV) {
    case "local":
      return new ConsoleOtpSender(env);
    case "test":
      return new TestOtpSender(env, redis, keys);
    default:
      throw new Error(`No OTP sender is configured for APP_ENV=${env.APP_ENV}`);
  }
}
