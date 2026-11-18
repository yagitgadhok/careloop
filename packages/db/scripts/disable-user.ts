/**
 * pnpm ops:disable-user -- --phone 98XXXXXXXX
 *
 * Disables a person in every clinic and revokes all their sessions.
 */
import { createSecurityKeys, disableUser, parsePhoneArgs } from "../src/index.js";
import { requireEnv } from "./env.js";
import { runCommand } from "./run-command.js";

await runCommand("ops:disable-user", async (db) => {
  const input = parsePhoneArgs(process.argv.slice(2), process.env);
  const keys = createSecurityKeys({ phonePepper: requireEnv("PHONE_HASH_PEPPER") });
  const result = await disableUser({ db, keys }, input);
  return `Disabled user ${result.userId}; revoked ${result.sessionsRevoked} session(s).`;
});
