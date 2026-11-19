import { parseArgs } from "node:util";
import type { Redis } from "ioredis";
import { toE164 } from "@careloop/shared/schemas";
import { securityEvent } from "./audit.js";
import { requireOperatorId } from "./organisations.js";
import type { SecurityKeys } from "./security-keys.js";
import type { Db } from "./tenant.js";

export interface OperatorPhoneInput {
  phone: string;
  operatorId: string;
}

/**
 * Clears every sign-in counter for one phone (lockouts, resend gap, daily
 * caps) across all IPs, and records who did it. Returns the number of keys
 * removed.
 */
export async function unlockPhone(
  deps: { db: Db; redis: Redis; keys: SecurityKeys },
  input: OperatorPhoneInput,
): Promise<number> {
  const phoneHash = deps.keys.phoneHash(input.phone);
  const removed = await deleteOtpCounters(deps.redis, deps.keys, phoneHash);
  await deps.db.withSystem("operator", (sys) =>
    securityEvent(sys, {
      type: "operator.unlock_phone",
      phoneHash,
      actorType: "operator",
      actorId: input.operatorId,
    }),
  );
  return removed;
}

/**
 * Deletes every sign-in counter for one phone hash, across all IPs. Uses SCAN,
 * never KEYS, so it does not block Redis. Returns the number of keys removed.
 */
export async function deleteOtpCounters(
  redis: Redis,
  keys: SecurityKeys,
  phoneHash: string,
): Promise<number> {
  let removed = 0;
  for (const pattern of keys.otp.allForPhone(phoneHash)) {
    const matches = pattern.includes("*") ? await scanAll(redis, pattern) : [pattern];
    if (matches.length) removed += await redis.del(...matches);
  }
  return removed;
}

async function scanAll(redis: Redis, pattern: string): Promise<string[]> {
  const found: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    found.push(...batch);
    cursor = next;
  } while (cursor !== "0");
  return found;
}

/**
 * Disables a person everywhere: their user is marked disabled and every
 * session they hold is revoked, so their next request and refresh fail in
 * every organisation.
 */
export async function disableUser(
  deps: { db: Db; keys: SecurityKeys },
  input: OperatorPhoneInput,
): Promise<{ userId: string; sessionsRevoked: number }> {
  const phone = toE164(input.phone);
  if (!phone) throw new Error("Phone is not a valid Indian mobile number");
  return deps.db.withSystem("operator", async (sys) => {
    const user = await sys.user.findUnique({ where: { phone } });
    if (!user) throw new Error("No user has that phone number");
    await sys.user.update({ where: { id: user.id }, data: { status: "disabled" } });
    const revoked = await sys.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await securityEvent(sys, {
      type: "operator.disable_user",
      userId: user.id,
      phoneHash: deps.keys.phoneHash(phone),
      actorType: "operator",
      actorId: input.operatorId,
    });
    return { userId: user.id, sessionsRevoked: revoked.count };
  });
}

/** Parses `--phone` for the unlock and disable commands. */
export function parsePhoneArgs(
  argv: string[],
  env: Record<string, string | undefined>,
): OperatorPhoneInput {
  const { values } = parseArgs({ args: argv, options: { phone: { type: "string" } } });
  const phone = toE164(values.phone ?? "");
  if (!phone) throw new Error("Pass --phone with a valid Indian mobile number");
  return { phone, operatorId: requireOperatorId(env) };
}
