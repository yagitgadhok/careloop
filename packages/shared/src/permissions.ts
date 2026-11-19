import type { Role } from "./schemas/common.js";

/** Every permission an API route can declare in this milestone. */
export const PERMISSIONS = ["org.read", "members.read", "members.manage"] as const;
export type CorePermission = (typeof PERMISSIONS)[number];

/**
 * Reserved for restricted visit sections, which the API returns only to
 * permitted roles. No role holds one yet, so every check against them is denied.
 */
export type VisitSectionPermission = `visit.section.${string}`;

export type Permission = CorePermission | VisitSectionPermission;

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  owner: ["org.read", "members.read", "members.manage"],
  doctor: ["org.read"],
  front_desk: ["org.read"],
};

/** The union of the permissions held by each role. */
export function permissionsFor(roles: readonly Role[]): ReadonlySet<Permission> {
  const granted = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) granted.add(permission);
  }
  return granted;
}

export function can(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(permission));
}
