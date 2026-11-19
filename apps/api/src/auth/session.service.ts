import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { audit, securityEvent, type Db, type SystemTx } from "@careloop/db";
import type { OrgChoice, Role, SessionResponse } from "@careloop/shared/schemas";
import type { Clock } from "../common/clock.js";
import { CLOCK, DB } from "../infra/tokens.js";
import { TokenVerifier, type AccessClaims } from "./token-verifier.js";

/** How long one sign-in lasts. Rotation does not extend it. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** A just-rotated refresh token is still accepted this long, for tabs refreshing together. */
export const REFRESH_GRACE_MS = 10 * 1000;

/** Request details recorded with security events and audit rows. IDs and hashes only. */
export interface RequestMeta {
  requestId: string;
  ipHash: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  /** Remaining session lifetime, for the refresh cookie's max-age. */
  refreshMaxAgeMs: number;
}

export type RefreshOutcome =
  | ({ kind: "rotated" } & IssuedTokens)
  /** Inside the grace window: a new access token; the refresh cookie already holds the newer token. */
  | { kind: "grace"; accessToken: string }
  | { kind: "failed" };

export type AuthState =
  | {
      status: "live";
      userId: string;
      sessionId: string;
      /** Every organisation the user can work in now. */
      organisations: OrgChoice[];
      /** Set only while the user's membership in the session's organisation is active. */
      organisationId?: string;
      roles?: Role[];
    }
  | { status: "revoked" }
  | { status: "expired" };

const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url");
const newRefreshToken = () => randomBytes(32).toString("base64url");

interface SessionWithUser {
  revokedAt: Date | null;
  expiresAt: Date;
  user: { status: string };
}

function isLive(session: SessionWithUser, now: Date): boolean {
  return (
    session.revokedAt === null &&
    session.expiresAt.getTime() > now.getTime() &&
    session.user.status === "active"
  );
}

/** The organisations a user can work in now: active memberships in active organisations. */
async function activeOrganisations(sys: SystemTx, userId: string): Promise<OrgChoice[]> {
  const rows = await sys.userMemberships(userId);
  return rows
    .filter((row) => row.status === "active" && row.organisationStatus === "active")
    .map((row) => ({
      organisationId: row.organisationId,
      organisationName: row.organisationName,
      roles: row.roles,
    }));
}

/**
 * Sessions: one row per sign-in. The refresh token rotates in place on the
 * row (its hash only is stored); the access token carries the session id, and
 * every request re-reads the row, the user and the live membership.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TokenVerifier) private readonly tokens: TokenVerifier,
  ) {}

  /**
   * Starts a session after a verified code. With exactly one organisation it
   * becomes active straight away (and the sign-in is audited there).
   */
  async signIn(
    userId: string,
    meta: RequestMeta,
  ): Promise<IssuedTokens & { organisations: OrgChoice[] }> {
    const now = this.clock.now();
    const refreshToken = newRefreshToken();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const { sessionId, organisations } = await this.db.withSystem("auth", async (sys) => {
      const session = await sys.session.create({
        data: {
          userId,
          familyId: randomUUID(),
          refreshTokenHash: hashToken(refreshToken),
          expiresAt,
          lastUsedAt: now,
        },
      });
      await securityEvent(sys, {
        type: "session.created",
        userId,
        ipHash: meta.ipHash,
        requestId: meta.requestId,
      });
      return { sessionId: session.id, organisations: await activeOrganisations(sys, userId) };
    });

    let active: string | null = null;
    const only = organisations.length === 1 ? organisations[0] : undefined;
    if (only && (await this.selectOrganisation(userId, sessionId, only.organisationId, meta))) {
      active = only.organisationId;
    }
    return {
      organisations,
      refreshToken,
      refreshMaxAgeMs: SESSION_TTL_MS,
      accessToken: this.tokens.sign({ sub: userId, sid: sessionId, org: active }),
    };
  }

  /**
   * Makes `organisationId` the session's active organisation if the user has
   * an active membership there, and audits the sign-in or switch in that
   * organisation in the same transaction. Returns the live roles, or null
   * when the user may not work there.
   */
  async selectOrganisation(
    userId: string,
    sessionId: string,
    organisationId: string,
    meta: RequestMeta,
  ): Promise<Role[] | null> {
    const roles = await this.db.withTenant(organisationId, async (ctx) => {
      const { tx } = ctx;
      const membership = await tx.membership.findUnique({
        where: { organisationId_userId: { organisationId, userId } },
      });
      const organisation = await tx.organisation.findUnique({ where: { id: organisationId } });
      if (membership?.status !== "active" || organisation?.status !== "active") return null;

      const session = await tx.session.findUnique({ where: { id: sessionId } });
      if (!session || session.revokedAt || session.userId !== userId) return null;
      if (session.activeOrganisationId === organisationId) return membership.roles;

      await tx.session.update({
        where: { id: sessionId },
        data: { activeOrganisationId: organisationId },
      });
      await audit(ctx, {
        actorType: "user",
        actorId: userId,
        action: session.activeOrganisationId ? "auth.org_switch" : "auth.sign_in",
        entityType: "session",
        entityIds: [sessionId],
        requestId: meta.requestId,
      });
      return membership.roles;
    });

    await this.db.withSystem("auth", (sys) =>
      securityEvent(sys, {
        type: roles ? "session.org_selected" : "session.org_refused",
        userId,
        organisationId,
        ipHash: meta.ipHash,
        requestId: meta.requestId,
      }),
    );
    return roles;
  }

  /** A fresh access token for the session's current state (after an org change). */
  accessTokenFor(userId: string, sessionId: string, organisationId: string | null): string {
    return this.tokens.sign({ sub: userId, sid: sessionId, org: organisationId });
  }

  /** The per-request check: session not revoked or expired, user active, live membership roles. */
  async authenticate(claims: AccessClaims): Promise<AuthState> {
    const now = this.clock.now();
    return this.db.withSystem("auth", async (sys): Promise<AuthState> => {
      const session = await sys.session.findUnique({
        where: { id: claims.sid },
        include: { user: { select: { status: true } } },
      });
      if (!session || session.userId !== claims.sub) return { status: "revoked" };
      if (session.revokedAt || session.user.status !== "active") return { status: "revoked" };
      if (session.expiresAt.getTime() <= now.getTime()) return { status: "expired" };

      const organisations = await activeOrganisations(sys, session.userId);
      const state: AuthState = {
        status: "live",
        userId: session.userId,
        sessionId: session.id,
        organisations,
      };
      const active = session.activeOrganisationId
        ? organisations.find((o) => o.organisationId === session.activeOrganisationId)
        : undefined;
      if (active) {
        state.organisationId = active.organisationId;
        state.roles = active.roles;
      }
      return state;
    });
  }

  /**
   * The signed-in user's organisations and the active one, from what
   * `authenticate` already loaded for this request.
   */
  describe(
    userId: string,
    organisations: OrgChoice[],
    activeOrganisationId: string | undefined,
  ): SessionResponse {
    const active = organisations.find((o) => o.organisationId === activeOrganisationId) ?? null;
    return { userId, organisations, active };
  }

  /**
   * Rotates a refresh token. The token just replaced is accepted again for a
   * short grace window (a new access token only). Presenting it after that
   * window means it leaked or was replayed: every session in its family is revoked.
   */
  async refresh(refreshToken: string, meta: RequestMeta): Promise<RefreshOutcome> {
    const now = this.clock.now();
    const hash = hashToken(refreshToken);
    return this.db.withSystem("auth", async (sys): Promise<RefreshOutcome> => {
      const event = (type: string, userId: string | null) =>
        securityEvent(sys, { type, userId, ipHash: meta.ipHash, requestId: meta.requestId });

      const current = await sys.session.findUnique({
        where: { refreshTokenHash: hash },
        include: { user: { select: { status: true } } },
      });
      if (current) {
        if (!isLive(current, now)) {
          await event("session.refresh_failed", current.userId);
          return { kind: "failed" };
        }
        const organisations = await activeOrganisations(sys, current.userId);
        const org = organisations.some((o) => o.organisationId === current.activeOrganisationId)
          ? current.activeOrganisationId
          : null;
        const next = newRefreshToken();
        const { count } = await sys.session.updateMany({
          where: { id: current.id, refreshTokenHash: hash, revokedAt: null },
          data: {
            refreshTokenHash: hashToken(next),
            previousRefreshTokenHash: hash,
            rotatedAt: now,
            lastUsedAt: now,
            activeOrganisationId: org,
          },
        });
        if (count === 1) {
          await event("session.refreshed", current.userId);
          return {
            kind: "rotated",
            refreshToken: next,
            refreshMaxAgeMs: current.expiresAt.getTime() - now.getTime(),
            accessToken: this.tokens.sign({ sub: current.userId, sid: current.id, org }),
          };
        }
        // Another request rotated this token first; treat this one as a grace-window retry.
      }

      const previous = await sys.session.findFirst({
        where: { previousRefreshTokenHash: hash },
        include: { user: { select: { status: true } } },
      });
      if (!previous) {
        await event("session.refresh_failed", null);
        return { kind: "failed" };
      }
      const inGrace =
        previous.rotatedAt !== null &&
        now.getTime() - previous.rotatedAt.getTime() <= REFRESH_GRACE_MS;
      if (inGrace && isLive(previous, now)) {
        await event("session.refresh_grace", previous.userId);
        return {
          kind: "grace",
          accessToken: this.tokens.sign({
            sub: previous.userId,
            sid: previous.id,
            org: previous.activeOrganisationId,
          }),
        };
      }
      await sys.session.updateMany({
        where: { familyId: previous.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
      await event("session.reuse_detected", previous.userId);
      return { kind: "failed" };
    });
  }

  /** Ends this session. Signing out of an active organisation is audited there. */
  async logout(userId: string, sessionId: string, meta: RequestMeta): Promise<void> {
    const now = this.clock.now();
    const session = await this.db.withSystem("auth", (sys) =>
      sys.session.findUnique({ where: { id: sessionId } }),
    );
    const organisationId = session?.activeOrganisationId;
    if (organisationId) {
      await this.db.withTenant(organisationId, async (ctx) => {
        await ctx.tx.session.updateMany({
          where: { id: sessionId, revokedAt: null },
          data: { revokedAt: now },
        });
        await audit(ctx, {
          actorType: "user",
          actorId: userId,
          action: "auth.sign_out",
          entityType: "session",
          entityIds: [sessionId],
          requestId: meta.requestId,
        });
      });
    }
    await this.db.withSystem("auth", async (sys) => {
      await sys.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
      await securityEvent(sys, {
        type: "session.logout",
        userId,
        organisationId: organisationId ?? null,
        ipHash: meta.ipHash,
        requestId: meta.requestId,
      });
    });
  }

  /** Revokes every other live session of this user. */
  async logoutOthers(userId: string, sessionId: string, meta: RequestMeta): Promise<void> {
    const now = this.clock.now();
    await this.db.withSystem("auth", async (sys) => {
      await sys.session.updateMany({
        where: { userId, id: { not: sessionId }, revokedAt: null },
        data: { revokedAt: now },
      });
      await securityEvent(sys, {
        type: "session.logout_others",
        userId,
        ipHash: meta.ipHash,
        requestId: meta.requestId,
      });
    });
  }
}
