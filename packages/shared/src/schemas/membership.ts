import { z } from "zod";
import { phoneSchema, roleSchema, uuidSchema } from "./common.js";

/** Issue code for a role list that names the same role twice. */
export const DUPLICATE_ROLE = "duplicate_role";

export const rolesSchema = z
  .array(roleSchema)
  .min(1)
  .refine((roles) => new Set(roles).size === roles.length, { message: DUPLICATE_ROLE });

export const inviteMemberBodySchema = z.object({
  phone: phoneSchema,
  roles: rolesSchema,
});
export type InviteMemberBody = z.input<typeof inviteMemberBodySchema>;

export const changeRolesBodySchema = z.object({ roles: rolesSchema });
export type ChangeRolesBody = z.infer<typeof changeRolesBodySchema>;

export const MEMBERSHIP_STATUSES = ["active", "deactivated"] as const;
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

/** A staff member of the selected organisation, as the team page shows it. */
export const membershipSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  organisationId: uuidSchema,
  name: z.string().nullable(),
  phone: z.string(),
  roles: z.array(roleSchema),
  status: membershipStatusSchema,
  createdAt: z.iso.datetime({ offset: true }),
});
export type Membership = z.infer<typeof membershipSchema>;

export const membershipListSchema = z.object({ memberships: z.array(membershipSchema) });
export type MembershipList = z.infer<typeof membershipListSchema>;
