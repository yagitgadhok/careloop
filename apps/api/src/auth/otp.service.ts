import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { Inject, Injectable, type BeforeApplicationShutdown } from "@nestjs/common";
import { securityEvent, type Db, type SecurityKeys } from "@careloop/db";
import { ErrorCode } from "@careloop/shared/errors";
import { AppError } from "../common/app-error.js";
import type { Clock } from "../common/clock.js";
import type { Logger } from "../common/logger.js";
import type { Env } from "../config/env.js";
import { CLOCK, DB, ENV, LOGGER, SECURITY_KEYS } from "../infra/tokens.js";
import { OTP_SENDER, type OtpSender } from "./otp-sender.js";
import { RateLimiter } from "./rate-limit.js";
import type { RequestMeta } from "./session.service.js";

export const OTP_TTL_MS = 5 * 60 * 1000;

/**
 * Phone sign-in codes. Requesting and verifying behave identically whether or
 * not a number is registered: the same limits apply, the same responses come
 * back, and all database work for a request happens after the response.
 */
@Injectable()
export class OtpService implements BeforeApplicationShutdown {
  private readonly inFlight = new Set<Promise<void>>();
  // Compared against when a phone has no live code, so both paths do the same work.
  private readonly decoyHash: Buffer;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DB) private readonly db: Db,
    @Inject(SECURITY_KEYS) private readonly keys: SecurityKeys,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
    @Inject(RateLimiter) private readonly limits: RateLimiter,
  ) {
    this.decoyHash = this.hashCode("decoy", "000000");
  }

  private hashCode(userId: string, code: string): Buffer {
    return createHmac("sha256", this.env.OTP_PEPPER).update(`${userId}:${code}`).digest();
  }

  /**
   * Applies the send limits and, when allowed, issues and sends a code in the
   * background (only registered, active users get one). Throws rate_limited.
   */
  async request(phone: string, meta: RequestMeta): Promise<void> {
    const phoneHash = this.keys.phoneHash(phone);
    const decision = await this.limits.trySend(phoneHash, meta.ipHash);
    if (decision === "ok") {
      this.background(() => this.issueAndSend(phone, phoneHash, meta));
      return;
    }
    this.background(() =>
      this.db.withSystem("auth", (sys) =>
        securityEvent(sys, { type: "otp.rate_limited", phoneHash, ...this.eventMeta(meta) }),
      ),
    );
    throw new AppError(ErrorCode.rate_limited);
  }

  /** Checks a code. Returns the user id, or throws invalid_code / rate_limited. */
  async verify(phone: string, code: string, meta: RequestMeta): Promise<string> {
    const phoneHash = this.keys.phoneHash(phone);
    const decision = await this.limits.tryAttempt(phoneHash, meta.ipHash);
    if (decision === "ip" || decision === "locked") {
      await this.event("otp.verify_refused", phoneHash, null, meta);
      throw new AppError(ErrorCode.rate_limited);
    }

    const now = this.clock.now();
    const userId = await this.db.withSystem("auth", async (sys) => {
      const user = await sys.user.findUnique({
        where: { phone },
        select: {
          id: true,
          status: true,
          otpChallenges: {
            where: { consumedAt: null, replacedAt: null, expiresAt: { gt: now } },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });
      const challenge = user?.status === "active" ? user.otpChallenges[0] : undefined;
      const expected = challenge ? Buffer.from(challenge.codeHash, "base64url") : this.decoyHash;
      const given = this.hashCode(user?.id ?? "decoy", code);
      const matches = timingSafeEqual(expected, given) && challenge !== undefined;
      if (!matches || !user || !challenge) return null;

      // Single use, even when two correct verifies race.
      const consumed = await sys.otpChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: now },
      });
      return consumed.count === 1 ? user.id : null;
    });

    if (!userId) {
      await this.event("otp.verify_failed", phoneHash, null, meta);
      if (decision === "last") await this.event("otp.locked", phoneHash, null, meta);
      throw new AppError(ErrorCode.invalid_code);
    }
    await this.limits.succeeded(phoneHash, meta.ipHash);
    await this.event("otp.verified", phoneHash, userId, meta);
    return userId;
  }

  /** Resolves once every background send has finished (used at shutdown and by tests). */
  async whenIdle(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.allSettled([...this.inFlight]);
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.whenIdle();
  }

  private async issueAndSend(phone: string, phoneHash: string, meta: RequestMeta): Promise<void> {
    const now = this.clock.now();
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const userId = await this.db.withSystem("auth", async (sys) => {
      const user = await sys.user.findUnique({
        where: { phone },
        select: { id: true, status: true },
      });
      const active = user?.status === "active" ? user : null;
      if (active) {
        await sys.otpChallenge.updateMany({
          where: { userId: active.id, consumedAt: null, replacedAt: null },
          data: { replacedAt: now },
        });
        await sys.otpChallenge.create({
          data: {
            userId: active.id,
            codeHash: this.hashCode(active.id, code).toString("base64url"),
            expiresAt: new Date(now.getTime() + OTP_TTL_MS),
          },
        });
      }
      await securityEvent(sys, {
        type: "otp.requested",
        userId: active?.id ?? null,
        phoneHash,
        ...this.eventMeta(meta),
      });
      return active?.id ?? null;
    });
    if (!userId) return;

    try {
      await this.sender.send(phone, code);
      await this.event("otp.sent", phoneHash, userId, meta);
    } catch (error) {
      this.logger.warn({ err: error }, "otp send failed");
      await this.event("otp.send_failed", phoneHash, userId, meta);
    }
  }

  private eventMeta(meta: RequestMeta) {
    return { ipHash: meta.ipHash, requestId: meta.requestId };
  }

  private event(type: string, phoneHash: string, userId: string | null, meta: RequestMeta) {
    return this.db.withSystem("auth", (sys) =>
      securityEvent(sys, { type, phoneHash, userId, ...this.eventMeta(meta) }),
    );
  }

  /** Runs work after the response has been sent, so timing can't reveal registration. */
  private background(work: () => Promise<unknown>): void {
    const task = new Promise<void>((resolve) => {
      setImmediate(() => {
        work()
          .catch((error: unknown) => this.logger.warn({ err: error }, "otp background task failed"))
          .finally(resolve);
      });
    });
    this.inFlight.add(task);
    void task.finally(() => this.inFlight.delete(task));
  }
}
