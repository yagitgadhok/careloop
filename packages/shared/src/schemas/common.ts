import { z } from "zod";

/** Issue code a field error carries when a phone number is not an Indian mobile. */
export const INVALID_PHONE = "invalid_phone";

const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/**
 * Reduce user input to the 10-digit national number, or null if it is not an
 * Indian mobile. Accepts spaces, hyphens, dots and brackets as separators, a
 * leading 0 trunk prefix, and a `+91` or `91` country code.
 */
export function toIndianMobile(input: string): string | null {
  let digits = input.trim().replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) {
    if (!digits.startsWith("+91")) return null;
    digits = digits.slice(3);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return INDIAN_MOBILE.test(digits) ? digits : null;
}

/** Normalises user input to the stored `+91XXXXXXXXXX` form, or null if invalid. */
export function toE164(input: string): string | null {
  const national = toIndianMobile(input);
  return national === null ? null : `+91${national}`;
}

/** An Indian mobile number, normalised to E.164 (`+91XXXXXXXXXX`). */
export const phoneSchema = z.string().transform((input, ctx) => {
  const phone = toE164(input);
  if (phone === null) {
    // The message is a code, never the input, so it is safe to return to the client.
    ctx.addIssue({ code: "custom", message: INVALID_PHONE });
    return z.NEVER;
  }
  return phone;
});
export type Phone = z.output<typeof phoneSchema>;

export const ROLES = ["owner", "doctor", "front_desk"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const uuidSchema = z.uuid();
export type Uuid = z.infer<typeof uuidSchema>;
