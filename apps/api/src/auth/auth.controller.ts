import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import type { SecurityKeys } from "@careloop/db";
import { ErrorCode } from "@careloop/shared/errors";
import {
  requestOtpBodySchema,
  selectOrgBodySchema,
  verifyOtpBodySchema,
  type OkResponse,
  type SelectOrgResponse,
  type SessionResponse,
  type VerifyOtpResponse,
} from "@careloop/shared/schemas";
import { AppError } from "../common/app-error.js";
import { Public, SessionOnly } from "../common/auth.decorators.js";
import { signedInOrganisations } from "../common/auth.guard.js";
import { contextOf, type RequestContext } from "../common/request-context.js";
import { SECURITY_KEYS } from "../infra/tokens.js";
import {
  clearAuthCookies,
  readCookie,
  REFRESH_COOKIE,
  setAccessCookie,
  setRefreshCookie,
  type CookieResponse,
} from "./cookies.js";
import { OtpService } from "./otp.service.js";
import { SessionService, type RequestMeta } from "./session.service.js";
import { ACCESS_TOKEN_TTL_MS } from "./token-verifier.js";

interface AuthRequest extends IncomingMessage {
  /** Client IP, honouring the configured trusted proxies. */
  ip?: string;
  cookies?: unknown;
}

interface SignedIn {
  userId: string;
  sessionId: string;
  context: RequestContext;
}

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(SECURITY_KEYS) private readonly keys: SecurityKeys,
  ) {}

  private meta(req: AuthRequest): RequestMeta {
    return {
      requestId: contextOf(req)?.requestId ?? "unknown",
      ipHash: this.keys.ipHash(req.ip ?? "unknown"),
    };
  }

  /** The session the auth guard resolved. */
  private signedIn(req: AuthRequest): SignedIn {
    const context = contextOf(req);
    if (!context?.userId || !context.sessionId) throw new AppError(ErrorCode.unauthenticated);
    return { userId: context.userId, sessionId: context.sessionId, context };
  }

  /** `{ ok: true }` unless a limit trips; then 429 rate_limited, for every phone alike. */
  @Public()
  @Post("otp/request")
  @HttpCode(200)
  async requestOtp(
    @Body({ schema: requestOtpBodySchema }) body: { phone: string },
    @Req() req: AuthRequest,
  ): Promise<OkResponse> {
    await this.otp.request(body.phone, this.meta(req));
    return { ok: true };
  }

  @Public()
  @Post("otp/verify")
  @HttpCode(200)
  async verifyOtp(
    @Body({ schema: verifyOtpBodySchema }) body: { phone: string; code: string },
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<VerifyOtpResponse> {
    const meta = this.meta(req);
    const userId = await this.otp.verify(body.phone, body.code, meta);
    const session = await this.sessions.signIn(userId, meta);
    setAccessCookie(res, session.accessToken, ACCESS_TOKEN_TTL_MS);
    setRefreshCookie(res, session.refreshToken, session.refreshMaxAgeMs);
    return { userId, organisations: session.organisations };
  }

  @SessionOnly()
  @Get("session")
  async session(@Req() req: AuthRequest): Promise<SessionResponse> {
    const { userId, context } = this.signedIn(req);
    const organisations = signedInOrganisations(req);
    if (!organisations) throw new AppError(ErrorCode.unauthenticated);
    return this.sessions.describe(userId, organisations, context.organisationId);
  }

  @SessionOnly()
  @Post("org/select")
  @HttpCode(200)
  async selectOrg(
    @Body({ schema: selectOrgBodySchema }) body: { organisationId: string },
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<SelectOrgResponse> {
    const { userId, sessionId, context } = this.signedIn(req);
    const roles = await this.sessions.selectOrganisation(
      userId,
      sessionId,
      body.organisationId,
      this.meta(req),
    );
    if (!roles) throw new AppError(ErrorCode.forbidden);
    context.organisationId = body.organisationId;
    context.roles = roles;
    setAccessCookie(
      res,
      this.sessions.accessTokenFor(userId, sessionId, body.organisationId),
      ACCESS_TOKEN_TTL_MS,
    );
    return { organisationId: body.organisationId, roles };
  }

  /** Reads only the refresh cookie. Any failure clears both cookies. */
  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<OkResponse> {
    const token = readCookie(req, REFRESH_COOKIE);
    const outcome = token ? await this.sessions.refresh(token, this.meta(req)) : null;
    if (!outcome || outcome.kind === "failed") {
      clearAuthCookies(res);
      throw new AppError(ErrorCode.unauthenticated);
    }
    setAccessCookie(res, outcome.accessToken, ACCESS_TOKEN_TTL_MS);
    if (outcome.kind === "rotated") {
      setRefreshCookie(res, outcome.refreshToken, outcome.refreshMaxAgeMs);
    }
    return { ok: true };
  }

  @SessionOnly()
  @Post("logout")
  @HttpCode(200)
  async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<OkResponse> {
    const { userId, sessionId } = this.signedIn(req);
    await this.sessions.logout(userId, sessionId, this.meta(req));
    clearAuthCookies(res);
    return { ok: true };
  }

  @SessionOnly()
  @Post("logout-others")
  @HttpCode(200)
  async logoutOthers(@Req() req: AuthRequest): Promise<OkResponse> {
    const { userId, sessionId } = this.signedIn(req);
    await this.sessions.logoutOthers(userId, sessionId, this.meta(req));
    return { ok: true };
  }
}
