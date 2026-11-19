import { Inject, Injectable } from "@nestjs/common";
import { audit, upsertUserByPhone, type Db, type TenantContext, type TenantTx } from "@careloop/db";
import { ErrorCode } from "@careloop/shared/errors";
import type { Membership, MembershipList, Role } from "@careloop/shared/schemas";
import { AppError } from "../common/app-error.js";
import type { Clock } from "../common/clock.js";
import { CLOCK, DB } from "../infra/tokens.js";

/** Who is acting: the signed-in user in their active organisation. IDs only. */
export interface Actor {
  userId: string;
  organisationId: string;
  requestId: string;
}

interface MembershipRow {
  id: string;
  userId: string;
  organisationId: string;
  roles: Role[];
  status: "active" | "deactivated";
  createdAt: Date;
  user: { phone: string };
}

const withPhone = { user: { select: { phone: true } } } as const;

function toMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    userId: row.userId,
    organisationId: row.organisationId,
    // Staff names are not collected yet.
    name: null,
    phone: row.user.phone,
    roles: row.roles,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Serialises membership changes within one organisation by locking its row,
 * so two concurrent changes can't each see the other owner and both remove
 * themselves, and two invites of one phone can't both insert.
 */
async function lockOrganisation(tx: TenantTx): Promise<void> {
  await tx.$queryRaw`SELECT id FROM organisation WHERE id = app.current_org() FOR UPDATE`;
}

/** The membership with this id in the transaction's organisation, or 404. */
async function findMembership(tx: TenantTx, membershipId: string): Promise<MembershipRow> {
  // Row-level security hides other organisations' rows, so a foreign id is simply not found.
  const row = await tx.membership.findUnique({ where: { id: membershipId }, include: withPhone });
  if (!row) throw new AppError(ErrorCode.not_found);
  return row;
}

/** Refuses a change that would leave the organisation with no active owner. */
async function keepAnOwner(tx: TenantTx, target: MembershipRow): Promise<void> {
  if (target.status !== "active" || !target.roles.includes("owner")) return;
  const otherOwners = await tx.membership.count({
    where: { status: "active", roles: { has: "owner" }, id: { not: target.id } },
  });
  if (otherOwners === 0) throw new AppError(ErrorCode.last_owner);
}

/**
 * Staff management in the active organisation: list, invite by phone, change
 * roles, deactivate and reactivate. Every read and change writes an audit row
 * in the same transaction.
 */
@Injectable()
export class MembershipsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private record(ctx: TenantContext, actor: Actor, action: string, ids: string[]) {
    return audit(ctx, {
      actorType: "user",
      actorId: actor.userId,
      action,
      entityType: "membership",
      entityIds: ids,
      requestId: actor.requestId,
    });
  }

  async list(actor: Actor): Promise<MembershipList> {
    return this.db.withTenant(actor.organisationId, async (ctx) => {
      const rows = await ctx.tx.membership.findMany({
        include: withPhone,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      await this.record(
        ctx,
        actor,
        "membership.list",
        rows.map((row) => row.id),
      );
      return { memberships: rows.map(toMembership) };
    });
  }

  /**
   * Adds a person by phone. The global user is found or created first; a
   * deactivated membership is reactivated with the given roles, and an active
   * one is a conflict.
   */
  async invite(actor: Actor, phone: string, roles: Role[]): Promise<Membership> {
    // Sign-in looks people up by phone before any organisation is known, so the
    // user row is global; it is created here on the same reviewed path.
    const user = await this.db.withSystem("auth", (sys) => upsertUserByPhone(sys, phone));

    return this.db.withTenant(actor.organisationId, async (ctx) => {
      const { tx, organisationId } = ctx;
      await lockOrganisation(tx);
      const existing = await tx.membership.findUnique({
        where: { organisationId_userId: { organisationId, userId: user.id } },
      });
      if (existing?.status === "active") throw new AppError(ErrorCode.conflict);

      if (existing) {
        const row = await tx.membership.update({
          where: { id: existing.id },
          data: { status: "active", deactivatedAt: null, roles },
          include: withPhone,
        });
        await this.record(ctx, actor, "membership.reactivated", [row.id]);
        return toMembership(row);
      }

      const row = await tx.membership.create({
        data: { organisationId, userId: user.id, roles },
        include: withPhone,
      });
      await this.record(ctx, actor, "membership.invite", [row.id]);
      return toMembership(row);
    });
  }

  /** Replaces a member's roles. Takes effect on their next request. */
  async changeRoles(actor: Actor, membershipId: string, roles: Role[]): Promise<Membership> {
    return this.db.withTenant(actor.organisationId, async (ctx) => {
      await lockOrganisation(ctx.tx);
      const target = await findMembership(ctx.tx, membershipId);
      if (!roles.includes("owner")) await keepAnOwner(ctx.tx, target);

      const row = await ctx.tx.membership.update({
        where: { id: target.id },
        data: { roles },
        include: withPhone,
      });
      await this.record(ctx, actor, "membership.roles_changed", [row.id]);
      return toMembership(row);
    });
  }

  /**
   * Deactivates a member and revokes their sessions working in this
   * organisation, so their next request is refused. Already deactivated is a
   * no-op.
   */
  async deactivate(actor: Actor, membershipId: string): Promise<Membership> {
    const now = this.clock.now();
    return this.db.withTenant(actor.organisationId, async (ctx) => {
      const { tx, organisationId } = ctx;
      await lockOrganisation(tx);
      const target = await findMembership(tx, membershipId);
      if (target.status === "deactivated") return toMembership(target);
      await keepAnOwner(tx, target);

      const row = await tx.membership.update({
        where: { id: target.id },
        data: { status: "deactivated", deactivatedAt: now },
        include: withPhone,
      });
      // Sessions are global rows; revoking in this transaction means the
      // deactivation and the sign-out commit together.
      await tx.session.updateMany({
        where: { userId: target.userId, activeOrganisationId: organisationId, revokedAt: null },
        data: { revokedAt: now },
      });
      await this.record(ctx, actor, "membership.deactivated", [row.id]);
      return toMembership(row);
    });
  }

  /** Restores a deactivated member with their previous roles. Already active is a no-op. */
  async reactivate(actor: Actor, membershipId: string): Promise<Membership> {
    return this.db.withTenant(actor.organisationId, async (ctx) => {
      await lockOrganisation(ctx.tx);
      const target = await findMembership(ctx.tx, membershipId);
      if (target.status === "active") return toMembership(target);

      const row = await ctx.tx.membership.update({
        where: { id: target.id },
        data: { status: "active", deactivatedAt: null },
        include: withPhone,
      });
      await this.record(ctx, actor, "membership.reactivated", [row.id]);
      return toMembership(row);
    });
  }
}
