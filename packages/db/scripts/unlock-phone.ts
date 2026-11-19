/**
 * pnpm ops:unlock-phone -- --phone 98XXXXXXXX
 *
 * Clears every sign-in lockout and rate-limit counter for one phone.
 */
import { Redis } from "ioredis";
import { createSecurityKeys, parsePhoneArgs, unlockPhone } from "../src/index.js";
import { requireEnv } from "./env.js";
import { runCommand } from "./run-command.js";

await runCommand("ops:unlock-phone", async (db) => {
  const input = parsePhoneArgs(process.argv.slice(2), process.env);
  const keys = createSecurityKeys({ phonePepper: requireEnv("PHONE_HASH_PEPPER") });
  const redis = new Redis(requireEnv("REDIS_URL"));
  try {
    const removed = await unlockPhone({ db, redis, keys }, input);
    return `Unlocked. Cleared ${removed} counter(s).`;
  } finally {
    redis.disconnect();
  }
});
