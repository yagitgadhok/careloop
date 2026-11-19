import { SetMetadata } from "@nestjs/common";
import type { Permission } from "@careloop/shared/permissions";

export const REQUIRED_PERMISSION = "careloop:required-permission";

/**
 * The permission a route needs in the active organisation, checked against
 * the live membership's roles. Every route that is neither `@Public()` nor
 * `@SessionOnly()` must declare one; the permission guard refuses it otherwise.
 */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION, permission);
