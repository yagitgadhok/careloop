import { AsyncLocalStorage } from "node:async_hooks";
import { createPrismaClient, type DbOptions, type PrismaClient } from "./client.js";
import type { Prisma } from "./generated/prisma/client.js";
import type { MembershipStatus, OrganisationStatus, Role } from "./generated/prisma/enums.js";

/** A transaction client scoped to one organisation by row-level security. */
export type TenantTx = Prisma.TransactionClient;

export type AfterCommit = (callback: () => void | Promise<void>) => void;

export interface TenantContext {
  tx: TenantTx;
  organisationId: string;
  /** Registers work (such as enqueueing a job) to run only after the transaction commits. */
  afterCommit: AfterCommit;
}

/** Why a system (non-tenant) transaction is needed. Each reason is a reviewed path. */
export type SystemReason = "auth" | "operator" | "seed";

const SYSTEM_MODELS = ["user", "otpChallenge", "session", "securityEvent"] as const;
type SystemModel = (typeof SYSTEM_MODELS)[number];

export interface UserMembershipRow {
  organisationId: string;
  organisationName: string;
  organisationStatus: OrganisationStatus;
  roles: Role[];
  status: MembershipStatus;
}

/** A transaction client restricted to the global tables plus the membership lookup. */
export type SystemTx = Pick<TenantTx, SystemModel> & {
  /** Every membership a user holds, across organisations. */
  userMemberships(userId: string): Promise<UserMembershipRow[]>;
};

export interface Db {
  withTenant<T>(organisationId: string, fn: (ctx: TenantContext) => Promise<T>): Promise<T>;
  withSystem<T>(reason: SystemReason, fn: (sys: SystemTx) => Promise<T>): Promise<T>;
  disconnect(): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_TIMEOUT_MS = 10_000;

interface ActiveScope {
  kind: "tenant" | "system";
  organisationId?: string;
}

export function createDb(options: DbOptions): Db {
  const prisma: PrismaClient = createPrismaClient(options);
  const timeout = options.transactionTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const scope = new AsyncLocalStorage<ActiveScope>();

  async function withTenant<T>(
    organisationId: string,
    fn: (ctx: TenantContext) => Promise<T>,
  ): Promise<T> {
    if (!UUID.test(organisationId)) {
      throw new Error("withTenant needs an organisation UUID");
    }
    const active = scope.getStore();
    if (active) {
      if (active.kind === "tenant" && active.organisationId !== organisationId) {
        throw new Error("Cannot open a tenant transaction for a different organisation");
      }
      throw new Error("Nested database scopes are not supported; reuse the outer transaction");
    }

    const callbacks: Array<() => void | Promise<void>> = [];
    const result = await scope.run({ kind: "tenant", organisationId }, () =>
      prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.organisation_id', ${organisationId}, true)`;
          return fn({ tx, organisationId, afterCommit: (cb) => callbacks.push(cb) });
        },
        { timeout },
      ),
    );
    for (const callback of callbacks) {
      await callback();
    }
    return result;
  }

  async function withSystem<T>(
    reason: SystemReason,
    fn: (sys: SystemTx) => Promise<T>,
  ): Promise<T> {
    if (scope.getStore()) {
      throw new Error("Nested database scopes are not supported; reuse the outer transaction");
    }
    return scope.run({ kind: "system" }, () =>
      prisma.$transaction(
        async (tx) => {
          const allowed = new Set<string>(SYSTEM_MODELS);
          const userMemberships = async (userId: string): Promise<UserMembershipRow[]> => {
            const rows = await tx.$queryRaw<
              Array<{
                organisation_id: string;
                organisation_name: string;
                organisation_status: OrganisationStatus;
                roles: Role[];
                status: MembershipStatus;
              }>
            >`SELECT * FROM app.user_memberships(${userId}::uuid)`;
            return rows.map((row) => ({
              organisationId: row.organisation_id,
              organisationName: row.organisation_name,
              organisationStatus: row.organisation_status,
              roles: row.roles,
              status: row.status,
            }));
          };
          const sys = new Proxy({} as SystemTx, {
            get(_target, property) {
              if (property === "userMemberships") return userMemberships;
              if (typeof property === "string" && allowed.has(property)) {
                return tx[property as SystemModel];
              }
              throw new Error(
                `${String(property)} is not available in a system context (reason: ${reason})`,
              );
            },
          });
          return fn(sys);
        },
        { timeout },
      ),
    );
  }

  return {
    withTenant,
    withSystem,
    disconnect: () => prisma.$disconnect(),
  };
}
