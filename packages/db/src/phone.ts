import { toIndianMobile } from "@careloop/shared/schemas";

/** Normalises user input to the stored `+91XXXXXXXXXX` form, or null if invalid. */
export function toE164(input: string): string | null {
  const national = toIndianMobile(input);
  return national === null ? null : `+91${national}`;
}
