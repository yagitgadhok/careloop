import { Inject, Injectable } from "@nestjs/common";
import type { SecurityKeys } from "@careloop/db";
import type { Redis, Result } from "ioredis";
import type { Clock } from "../common/clock.js";
import { CLOCK, REDIS, SECURITY_KEYS } from "../infra/tokens.js";

/**
 * Sign-in limits. Every counter is kept for every phone, registered or not.
 * The phone-wide backstops use a one-hour window, so someone who knows a
 * user's number can lock them out for at most an hour, not a day.
 */
export const LIMITS = {
  ipRequests: 60,
  ipWindowMs: 60 * 60 * 1000,
  resendGapMs: 30 * 1000,
  /** Sends to one phone at the request of one IP per day. */
  sendsPerPhoneAndIp: 10,
  /** Sends to one phone across all IPs per `phoneWindowMs`. */
  sendsPerPhone: 30,
  failuresPerPhoneAndIp: 5,
  /** Failures for one phone across all IPs per `phoneWindowMs`; reaching it locks the phone until the window ends. */
  failuresPerPhone: 20,
  phoneWindowMs: 60 * 60 * 1000,
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

// Times that matter to a decision (resend gap, lockout end, end of a
// phone-wide window) are stored as values and compared with the injected
// clock. Redis TTLs only clean up keys and bound the other counting windows.
// Each script runs atomically, so parallel requests can't slip past a limit.

const INCREMENT_WINDOWED = `
local function incr(key, ttl)
  local n = redis.call('INCR', key)
  if n == 1 then redis.call('PEXPIRE', key, ttl) end
  return n
end
`;

// A counter whose window opens with its first event and ends at a time kept
// in a companion key, judged by the injected clock.
const CLOCKED_WINDOW = `
local function windowCount(countKey, endKey, now)
  if tonumber(redis.call('GET', endKey) or '0') <= now then return 0 end
  return tonumber(redis.call('GET', countKey) or '0')
end
local function windowIncr(countKey, endKey, now, windowMs)
  if tonumber(redis.call('GET', endKey) or '0') <= now then
    redis.call('SET', countKey, 1, 'PX', windowMs)
    redis.call('SET', endKey, now + windowMs, 'PX', windowMs)
    return 1
  end
  return redis.call('INCR', countKey)
end
`;

// KEYS: ipRequests, pairSends, phoneSends, resendGap, phoneSendsWindow
// ARGV: now, ipLimit, ipWindowMs, pairCap, phoneCap, dayMs, gapMs, phoneWindowMs
const SEND_SCRIPT = `${INCREMENT_WINDOWED}${CLOCKED_WINDOW}
local now = tonumber(ARGV[1])
if incr(KEYS[1], ARGV[3]) > tonumber(ARGV[2]) then return 'ip' end
if tonumber(redis.call('GET', KEYS[4]) or '0') > now then return 'gap' end
if tonumber(redis.call('GET', KEYS[2]) or '0') >= tonumber(ARGV[4]) then return 'cap' end
if windowCount(KEYS[3], KEYS[5], now) >= tonumber(ARGV[5]) then return 'cap' end
incr(KEYS[2], ARGV[6])
windowIncr(KEYS[3], KEYS[5], now, tonumber(ARGV[8]))
redis.call('SET', KEYS[4], now + tonumber(ARGV[7]), 'PX', ARGV[7])
return 'ok'
`;

// Reserves one verify attempt before the code is checked, so at most five
// guesses per phone and IP are ever compared.
// Phone-wide failures lock the phone (every IP) once they reach phoneMax,
// until that window ends.
// KEYS: ipRequests, pairFailures, pairLockout, phoneFailures, phoneFailuresWindow
// ARGV: now, ipLimit, ipWindowMs, pairMax, lockoutMs, phoneMax, phoneWindowMs
const ATTEMPT_SCRIPT = `${INCREMENT_WINDOWED}${CLOCKED_WINDOW}
local now = tonumber(ARGV[1])
if incr(KEYS[1], ARGV[3]) > tonumber(ARGV[2]) then return 'ip' end
local lockedUntil = tonumber(redis.call('GET', KEYS[3]) or '0')
if lockedUntil > now then return 'locked' end
if lockedUntil > 0 then redis.call('DEL', KEYS[3]) end
if windowCount(KEYS[4], KEYS[5], now) >= tonumber(ARGV[6]) then return 'locked' end
local failures = incr(KEYS[2], ARGV[5])
windowIncr(KEYS[4], KEYS[5], now, tonumber(ARGV[7]))
if failures >= tonumber(ARGV[4]) then
  redis.call('SET', KEYS[3], now + tonumber(ARGV[5]), 'PX', ARGV[5])
  redis.call('DEL', KEYS[2])
  return 'last'
end
return 'ok'
`;

// A correct code: the reserved attempt was not a failure.
// KEYS: pairFailures, pairLockout, phoneFailures, phoneFailuresWindow
// ARGV: now
const SUCCESS_SCRIPT = `${CLOCKED_WINDOW}
redis.call('DEL', KEYS[1], KEYS[2])
if windowCount(KEYS[3], KEYS[4], tonumber(ARGV[1])) > 0 then redis.call('DECR', KEYS[3]) end
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
    redis.defineCommand("otpTrySend", { numberOfKeys: 5, lua: SEND_SCRIPT });
    redis.defineCommand("otpTryAttempt", { numberOfKeys: 5, lua: ATTEMPT_SCRIPT });
    redis.defineCommand("otpSucceeded", { numberOfKeys: 4, lua: SUCCESS_SCRIPT });
  }

  /** Counts a code request and, when allowed, the send it leads to. */
  async trySend(phoneHash: string, ipHash: string): Promise<SendDecision> {
    const { otp } = this.keys;
    const result = await this.redis.otpTrySend(
      otp.ipRequests(ipHash),
      otp.dailySends(phoneHash, ipHash),
      otp.phoneSends(phoneHash),
      otp.resendGap(phoneHash),
      otp.phoneSendsWindow(phoneHash),
      this.clock.now().getTime(),
      LIMITS.ipRequests,
      LIMITS.ipWindowMs,
      LIMITS.sendsPerPhoneAndIp,
      LIMITS.sendsPerPhone,
      LIMITS.dayMs,
      LIMITS.resendGapMs,
      LIMITS.phoneWindowMs,
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
      otp.phoneFailuresWindow(phoneHash),
      this.clock.now().getTime(),
      LIMITS.ipRequests,
      LIMITS.ipWindowMs,
      LIMITS.failuresPerPhoneAndIp,
      LIMITS.lockoutMs,
      LIMITS.failuresPerPhone,
      LIMITS.phoneWindowMs,
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
      otp.phoneFailuresWindow(phoneHash),
      this.clock.now().getTime(),
    );
  }
}
