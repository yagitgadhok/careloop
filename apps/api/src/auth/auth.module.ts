import { Module } from "@nestjs/common";
import type { SecurityKeys } from "@careloop/db";
import type { Redis } from "ioredis";
import type { Env } from "../config/env.js";
import { ENV, REDIS, SECURITY_KEYS } from "../infra/tokens.js";
import { AuthController } from "./auth.controller.js";
import { createOtpSender, OTP_SENDER } from "./otp-sender.js";
import { OtpService } from "./otp.service.js";
import { RateLimiter } from "./rate-limit.js";
import { SessionService } from "./session.service.js";
import { TokenVerifier } from "./token-verifier.js";

@Module({
  controllers: [AuthController],
  providers: [
    TokenVerifier,
    SessionService,
    OtpService,
    RateLimiter,
    {
      // Fails start-up where no real sender exists yet (staging, production).
      provide: OTP_SENDER,
      useFactory: (env: Env, redis: Redis, keys: SecurityKeys) => createOtpSender(env, redis, keys),
      inject: [ENV, REDIS, SECURITY_KEYS],
    },
  ],
  exports: [TokenVerifier, SessionService],
})
export class AuthModule {}
