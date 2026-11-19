import { Inject, Injectable } from "@nestjs/common";
import type { SecurityKeys } from "@careloop/db";
import type { Redis, Result } from "ioredis";
import type { Clock } from "../common/clock.js";
import { CLOCK, REDIS, SECURITY_KEYS } from "../infra/tokens.js";

/** Sign-in limits. Every counter is kept for every phone, registered or not. */
export const LIMITS = {
  ipRequests: 60,
  ipWindowMs: 60 * 60 * 1000,
  resendGapMs: 30 * 1000,
  sendsPerPhoneAndIp: 10,
  sendsPerPhone: 30,
  failuresPerPhoneAndIp: 5,
  failuresPerPhone: 20,
  lockoutMs: 15 * 60 * 1000,
  dayMs: 24 * 60 * 60 * 1000,
} as const;

type ScriptArg = string | number;

// Typings for the scripts registered with defineCommand below.
declare module "ioredis" {
  interface RedisCommander<Context> {
    otpTrySend(...keysThenArgs: ScriptArg[]): Result<unknown, Context>;
    otpTryAttempt(...keysThenArgs: ScriptArg[]): Result<unknown, Context>;
    otpSucceeded(...keysThenArgs: ScriptArg[]): Result<unknown, Context>;
  }
}

// Times that matter to a decision (resend gap, lockout end) are stored as
// values and compared with the injected clock. Redis TTLs only clean up keys
// and bound the counting windows. Each script runs atomically, so parallel
// requests can't slip past a limit.

const INCREMENT_WINDOWED = `
local function incr(key, ttl)
  local n = redis.call('INCR', key)
  if n == 1 then redis.call('PEXPIRE', key, ttl) end
  return n
end
`;

// KEYS: ipRequests, pairSends, phoneSends, resendGap
// ARGV: now, ipLimit, ipWindowMs, pairCap, phoneCap, dayMs, gapMs
const SEND_SCRIPT = `${INCREMENT_WINDOWED}
local now = tonumber(ARGV[1])
if incr(KEYS[1], ARGV[3]) > tonumber(ARGV[2]) then return 'ip' end
if tonumber(redis.call('GET', KEYS[4]) or '0') > now then return 'gap' end
if tonumber(redis.call('GET', KEYS[2]) or '0') >= tonumber(ARGV[4]) then return 'cap' end
if tonumber(redis.call('GET', KEYS[3]) or '0') >= tonumber(ARGV[5]) then return 'cap' end
incr(KEYS[2], ARGV[6])
incr(KEYS[3], ARGV[6])
redis.call('SET', KEYS[4], now + tonumber(ARGV[7]), 'PX', ARGV[7])
return 'ok'
`;

// Reserves one verify attempt before the code is checked, so at most five
// guesses per phone and IP are ever compared.
// KEYS: ipRequests, pairFailures, pairLockout, phoneFailures
// ARGV: now, ipLimit, ipWindowMs, pairMax, lockoutMs, phoneMax, dayMs
const ATTEMPT_SCRIPT = `${INCREMENT_WINDOWED}
local now = tonumber(ARGV[1])
if incr(KEYS[1], ARGV[3]) > tonumber(ARGV[2]) then return 'ip' end
local lockedUntil = tonumber(redis.call('GET', KEYS[3]) or '0')
if lockedUntil > now then return 'locked' end
if lockedUntil > 0 then redis.call('DEL', KEYS[3]) end
if tonumber(redis.call('GET', KEYS[4]) or '0') >= tonumber(ARGV[6]) then return 'locked' end
local failures = incr(KEYS[2], ARGV[5])
incr(KEYS[4], ARGV[7])
if failures >= tonumber(ARGV[4]) then
  redis.call('SET', KEYS[3], now + tonumber(ARGV[5]), 'PX', ARGV[5])
  redis.call('DEL', KEYS[2])
  return 'last'
end
return 'ok'
`;

// A correct code: the reserved attempt was not a failure.
// KEYS: pairFailures, pairLockout, phoneFailures
const SUCCESS_SCRIPT = `
redis.call('DEL', KEYS[1], KEYS[2])
if tonumber(redis.call('GET', KEYS[3]) or '0') > 0 then redis.call('DECR', KEYS[3]) end
return 'ok'
`;

/** `ok` to send; anything else is refused with the same rate-limited response. */
export type SendDecision = "ok" | "ip" | "gap" | "cap";
/** `ok` to check the code; `last` too, but a wrong code now locks the pair; `locked`/`ip` refuse. */
export type AttemptDecision = "ok" | "last" | "locked" | "ip";

@Injectable()
export class RateLimiter {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(SECURITY_KEYS) private readonly keys: SecurityKeys,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    // Registered once: ioredis sends EVALSHA and falls back to EVAL when Redis lacks the script.
    redis.defineCommand("otpTrySend", { numberOfKeys: 4, lua: SEND_SCRIPT });
    redis.defineCommand("otpTryAttempt", { numberOfKeys: 4, lua: ATTEMPT_SCRIPT });
    redis.defineCommand("otpSucceeded", { numberOfKeys: 3, lua: SUCCESS_SCRIPT });
  }

  /** Counts a code request and, when allowed, the send it leads to. */
  async trySend(phoneHash: string, ipHash: string): Promise<SendDecision> {
    const { otp } = this.keys;
    const result = await this.redis.otpTrySend(
      otp.ipRequests(ipHash),
      otp.dailySends(phoneHash, ipHash),
      otp.phoneSends(phoneHash),
      otp.resendGap(phoneHash),
      this.clock.now().getTime(),
      LIMITS.ipRequests,
      LIMITS.ipWindowMs,
      LIMITS.sendsPerPhoneAndIp,
      LIMITS.sendsPerPhone,
      LIMITS.dayMs,
      LIMITS.resendGapMs,
    );
    return result as SendDecision;
  }

  /** Reserves a verify attempt, counted as a failure until `succeeded` is called. */
  async tryAttempt(phoneHash: string, ipHash: string): Promise<AttemptDecision> {
    const { otp } = this.keys;
    const result = await this.redis.otpTryAttempt(
      otp.ipRequests(ipHash),
      otp.failures(phoneHash, ipHash),
      otp.lockout(phoneHash, ipHash),
      otp.phoneFailures(phoneHash),
      this.clock.now().getTime(),
      LIMITS.ipRequests,
      LIMITS.ipWindowMs,
      LIMITS.failuresPerPhoneAndIp,
      LIMITS.lockoutMs,
      LIMITS.failuresPerPhone,
      LIMITS.dayMs,
    );
    return result as AttemptDecision;
  }

  /** Clears the pair's failures and lockout, and gives back the reserved backstop attempt. */
  async succeeded(phoneHash: string, ipHash: string): Promise<void> {
    const { otp } = this.keys;
    await this.redis.otpSucceeded(
      otp.failures(phoneHash, ipHash),
      otp.lockout(phoneHash, ipHash),
      otp.phoneFailures(phoneHash),
    );
  }
}
