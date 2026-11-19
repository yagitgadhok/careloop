import { z } from "zod";
import { phoneSchema, roleSchema, uuidSchema } from "./common.js";

export const requestOtpBodySchema = z.object({ phone: phoneSchema });
export type RequestOtpBody = z.input<typeof requestOtpBodySchema>;

export const verifyOtpBodySchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/),
});
export type VerifyOtpBody = z.input<typeof verifyOtpBodySchema>;

export const selectOrgBodySchema = z.object({ organisationId: uuidSchema });
export type SelectOrgBody = z.infer<typeof selectOrgBodySchema>;

/** Body for calls that only acknowledge. OTP request returns it whether or not the number is registered. */
export const okResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof okResponseSchema>;

/** One organisation the signed-in user can choose. */
export const orgChoiceSchema = z.object({
  organisationId: uuidSchema,
  organisationName: z.string(),
  roles: z.array(roleSchema),
});
export type OrgChoice = z.infer<typeof orgChoiceSchema>;

export const verifyOtpResponseSchema = z.object({
  userId: uuidSchema,
  organisations: z.array(orgChoiceSchema),
});
export type VerifyOtpResponse = z.infer<typeof verifyOtpResponseSchema>;

export const selectOrgResponseSchema = z.object({
  organisationId: uuidSchema,
  roles: z.array(roleSchema),
});
export type SelectOrgResponse = z.infer<typeof selectOrgResponseSchema>;

/**
 * The signed-in user's current session: every clinic they can work in, and
 * the active one (null until they pick). Roles come from the live membership.
 */
export const sessionResponseSchema = z.object({
  userId: uuidSchema,
  organisations: z.array(orgChoiceSchema),
  active: z
    .object({
      organisationId: uuidSchema,
      organisationName: z.string(),
      roles: z.array(roleSchema),
    })
    .nullable(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
