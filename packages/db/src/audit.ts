import type { ActorType } from "./generated/prisma/enums.js";
import type { SystemTx, TenantContext } from "./tenant.js";

/**
 * One audit entry: who did what to which records. IDs and enums only, never
 * patient data or free text. A list read records every returned id in one row.
 */
export interface AuditEntry {
  actorType: ActorType;
  actorId?: string | null;
  /** Dotted verb, e.g. "membership.invite" or "auth.sign_in". */
  action: string;
  /** Table or record kind, e.g. "membership". */
  entityType: string;
  entityIds: string[];
  requestId?: string | null;
}

/**
 * Writes an audit row inside the caller's tenant transaction, so it commits or
 * rolls back with the work it records. A failed audit write fails the request.
 */
export async function audit(ctx: TenantContext, entry: AuditEntry): Promise<void> {
  await ctx.tx.auditLog.create({
    data: {
      organisationId: ctx.organisationId,
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityIds: entry.entityIds,
      requestId: entry.requestId ?? null,
    },
  });
}

/** A pre-tenant security event. Phones and IPs arrive already hashed. */
export interface SecurityEventEntry {
  type: string;
  userId?: string | null;
  phoneHash?: string | null;
  ipHash?: string | null;
  organisationId?: string | null;
  actorType?: ActorType;
  actorId?: string | null;
  requestId?: string | null;
}

export async function securityEvent(sys: SystemTx, entry: SecurityEventEntry): Promise<void> {
  await sys.securityEvent.create({
    data: {
      type: entry.type,
      userId: entry.userId ?? null,
      phoneHash: entry.phoneHash ?? null,
      ipHash: entry.ipHash ?? null,
      organisationId: entry.organisationId ?? null,
      actorType: entry.actorType ?? "user",
      actorId: entry.actorId ?? null,
      requestId: entry.requestId ?? null,
    },
  });
}
