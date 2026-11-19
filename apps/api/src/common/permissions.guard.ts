import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { IncomingMessage } from "node:http";
import { ErrorCode } from "@careloop/shared/errors";
import { can, type Permission } from "@careloop/shared/permissions";
import { AppError } from "./app-error.js";
import { IS_PUBLIC, IS_SESSION_ONLY } from "./auth.decorators.js";
import { REQUIRED_PERMISSION } from "./permission.decorator.js";
import { contextOf } from "./request-context.js";

/**
 * Runs after the auth guard. Denies by default: a route that is neither
 * `@Public()` nor `@SessionOnly()` must declare `@RequirePermission(...)`, and
 * the roles the auth guard loaded from the live membership must grant it.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(IS_SESSION_ONLY, targets)) return true;

    const permission = this.reflector.getAllAndOverride<Permission | undefined>(
      REQUIRED_PERMISSION,
      targets,
    );
    if (!permission) throw new AppError(ErrorCode.forbidden);

    const requestContext = contextOf(context.switchToHttp().getRequest<IncomingMessage>());
    if (!requestContext?.userId) throw new AppError(ErrorCode.unauthenticated);
    if (!requestContext.organisationId) throw new AppError(ErrorCode.org_not_selected);
    if (!can(requestContext.roles ?? [], permission)) throw new AppError(ErrorCode.forbidden);
    return true;
  }
}
