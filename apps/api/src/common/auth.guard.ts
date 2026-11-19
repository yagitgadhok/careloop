import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { IncomingMessage } from "node:http";
import { ErrorCode } from "@careloop/shared/errors";
import type { OrgChoice } from "@careloop/shared/schemas";
import {
  ACCESS_COOKIE,
  clearAuthCookies,
  readCookie,
  type CookieResponse,
} from "../auth/cookies.js";
import { SessionService } from "../auth/session.service.js";
import { TokenVerifier } from "../auth/token-verifier.js";
import { AppError } from "./app-error.js";
import { IS_PUBLIC, IS_SESSION_ONLY } from "./auth.decorators.js";
import { contextOf } from "./request-context.js";

// Kept apart from the request context, which holds ids only.
const organisationsByRequest = new WeakMap<IncomingMessage, OrgChoice[]>();

/** The organisations the auth guard loaded for this request's user, if it ran. */
export function signedInOrganisations(req: IncomingMessage): OrgChoice[] | undefined {
  return organisationsByRequest.get(req);
}

/**
 * Authenticates every route that isn't `@Public()`: verifies the access
 * cookie, re-reads the session row (not revoked, user active) and loads roles
 * from the live membership. The active organisation comes only from the
 * session row, never from anything the client sends. Routes that aren't
 * `@SessionOnly()` also need an active organisation.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenVerifier) private readonly tokens: TokenVerifier,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const http = context.switchToHttp();
    const req = http.getRequest<IncomingMessage & { cookies?: unknown }>();
    const token = readCookie(req, ACCESS_COOKIE);
    if (!token) throw new AppError(ErrorCode.unauthenticated);
    const claims = await this.tokens.verify(token);

    const state = await this.sessions.authenticate(claims);
    if (state.status === "revoked") {
      clearAuthCookies(http.getResponse<CookieResponse>());
      throw new AppError(ErrorCode.session_revoked);
    }
    if (state.status === "expired") throw new AppError(ErrorCode.unauthenticated);

    organisationsByRequest.set(req, state.organisations);
    const requestContext = contextOf(req);
    if (requestContext) {
      requestContext.userId = state.userId;
      requestContext.sessionId = state.sessionId;
      if (state.organisationId) {
        requestContext.organisationId = state.organisationId;
        requestContext.roles = state.roles ?? [];
      }
    }

    if (this.reflector.getAllAndOverride<boolean>(IS_SESSION_ONLY, targets)) return true;
    if (!state.organisationId) throw new AppError(ErrorCode.org_not_selected);
    return true;
  }
}
