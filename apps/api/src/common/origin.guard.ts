import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import { ErrorCode } from "@careloop/shared/errors";
import type { Env } from "../config/env.js";
import { ENV } from "../infra/tokens.js";
import { AppError } from "./app-error.js";

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function hasBody(req: IncomingMessage): boolean {
  const length = req.headers["content-length"];
  return req.headers["transfer-encoding"] !== undefined || (length !== undefined && length !== "0");
}

function isJson(req: IncomingMessage): boolean {
  const mediaType = req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
  return mediaType === "application/json";
}

/**
 * Request hygiene for state-changing requests, against cross-site request forgery:
 * - `Origin` must be the web origin, because the browser calls the API same-origin;
 * - a request with a body must send it as `application/json`. A request with no
 *   body at all (logout, refresh) needs no content type.
 * Forms and other "simple" cross-site requests therefore never reach a handler.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<IncomingMessage>();
    if (!req.method || !STATE_CHANGING.has(req.method)) return true;
    if (req.headers.origin !== this.env.WEB_ORIGIN) {
      throw new AppError(ErrorCode.forbidden);
    }
    if (hasBody(req) && !isJson(req)) {
      throw new AppError(ErrorCode.validation_failed, { status: 415 });
    }
    return true;
  }
}
