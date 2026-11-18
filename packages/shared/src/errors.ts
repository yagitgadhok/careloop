import { z } from "zod";

/** Stable error codes the API returns. Clients branch on these, so never rename one. */
export const ErrorCode = {
  validation_failed: "validation_failed",
  unauthenticated: "unauthenticated",
  session_revoked: "session_revoked",
  org_not_selected: "org_not_selected",
  forbidden: "forbidden",
  not_found: "not_found",
  conflict: "conflict",
  rate_limited: "rate_limited",
  invalid_code: "invalid_code",
  last_owner: "last_owner",
  internal_error: "internal_error",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const errorCodeSchema = z.enum(ErrorCode);

/** A field that failed validation: where, and why. Never the submitted value. */
export const fieldErrorSchema = z.object({
  path: z.string(),
  code: z.string(),
});
export type FieldError = z.infer<typeof fieldErrorSchema>;

export const errorResponseSchema = z.object({
  code: errorCodeSchema,
  requestId: z.string(),
  fields: z.array(fieldErrorSchema).optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
