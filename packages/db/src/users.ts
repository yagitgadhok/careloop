import type { SystemTx } from "./tenant.js";

/** The global user with this E.164 phone, created if there is none yet. */
export function upsertUserByPhone(sys: SystemTx, phone: string) {
  return sys.user.upsert({ where: { phone }, create: { phone }, update: {} });
}
