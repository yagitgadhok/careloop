import type { SecurityKeys } from "@careloop/db";
import type { Redis } from "ioredis";
import type { Env } from "../config/env.js";
import { assertDevelopmentSender } from "./development-sender.js";
import type { OtpSender } from "./otp-sender.js";

const TTL_SECONDS = 5 * 60;

/**
 * Tests and end-to-end runs only: stores the latest code in Redis, where the
 * test reads it. There is deliberately no HTTP route that returns codes.
 */
export class TestOtpSender implements OtpSender {
  constructor(
    env: Pick<Env, "APP_ENV">,
    private readonly redis: Redis,
    private readonly keys: SecurityKeys,
  ) {
    assertDevelopmentSender(env, "The test OTP sender");
  }

  async send(phone: string, code: string): Promise<void> {
    await this.redis.set(
      this.keys.otp.testCode(this.keys.phoneHash(phone)),
      code,
      "EX",
      TTL_SECONDS,
    );
  }
}
