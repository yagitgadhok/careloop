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

/**
 * Picks the sender for this environment at start-up. Only the development
 * senders exist; an SMS sender for staging and production needs a
 * DLT-registered template first. Anywhere else the API refuses to start
 * rather than silently dropping codes.
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
