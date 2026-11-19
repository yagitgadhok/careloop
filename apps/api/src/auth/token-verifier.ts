import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ErrorCode } from "@careloop/shared/errors";
import { z } from "zod";
import { AppError } from "../common/app-error.js";
import type { Clock } from "../common/clock.js";
import type { Env } from "../config/env.js";
import { CLOCK, ENV } from "../infra/tokens.js";

export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const ALGORITHM = "HS256";

/** What an access token says. The session row, not `org`, decides the active organisation. */
export interface AccessClaims {
  /** User id. */
  sub: string;
  /** Session id. */
  sid: string;
  /** Active organisation when the token was issued, or null. */
  org: string | null;
}

const claimsSchema = z.object({
  sub: z.uuid(),
  sid: z.uuid(),
  org: z.uuid().nullable(),
});

/**
 * Signs and verifies access tokens. Transport-neutral: it takes and returns
 * strings, so the WebSocket handshake and mobile bearer tokens can reuse it.
 * The algorithm, issuer and audience are pinned on both sides.
 */
@Injectable()
export class TokenVerifier {
  private readonly jwt: JwtService;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.jwt = new JwtService({ secret: env.JWT_SECRET });
  }

  sign(claims: AccessClaims): string {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    return this.jwt.sign(
      { ...claims, iat, exp: iat + ACCESS_TOKEN_TTL_MS / 1000 },
      { algorithm: ALGORITHM, issuer: this.env.JWT_ISSUER, audience: this.env.JWT_AUDIENCE },
    );
  }

  /** The token's claims, or an `unauthenticated` error for any bad, expired or foreign token. */
  async verify(token: string): Promise<AccessClaims> {
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(token, {
        algorithms: [ALGORITHM],
        issuer: this.env.JWT_ISSUER,
        audience: this.env.JWT_AUDIENCE,
        clockTimestamp: Math.floor(this.clock.now().getTime() / 1000),
      });
    } catch {
      throw new AppError(ErrorCode.unauthenticated);
    }
    const parsed = claimsSchema.safeParse(payload);
    if (!parsed.success) throw new AppError(ErrorCode.unauthenticated);
    return parsed.data;
  }
}
