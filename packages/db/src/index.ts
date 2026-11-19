// Public entry point. The raw Prisma client is deliberately not exported:
// all database work goes through withTenant or withSystem.
export { createDb } from "./tenant.js";
export type {
  AfterCommit,
  Db,
  SystemReason,
  SystemTx,
  TenantContext,
  TenantTx,
  UserMembershipRow,
} from "./tenant.js";
export type { DbOptions } from "./client.js";
export { audit, securityEvent } from "./audit.js";
export type { AuditEntry, SecurityEventEntry } from "./audit.js";
export { createSecurityKeys } from "./security-keys.js";
export {
  createOrganisation,
  parseCreateOrganisationArgs,
  requireOperatorId,
} from "./organisations.js";
export type { CreateOrganisationInput, CreateOrganisationResult } from "./organisations.js";
export { disableUser, parsePhoneArgs, unlockPhone } from "./operators.js";
export type { OperatorPhoneInput } from "./operators.js";
export type { SecurityKeys, SecurityKeyOptions } from "./security-keys.js";
export {
  ActorType,
  MembershipStatus,
  OrganisationStatus,
  Role,
  UserStatus,
} from "./generated/prisma/enums.js";
