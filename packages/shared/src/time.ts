import { z } from "zod";

/** Instants are stored in UTC and shown in this zone. */
export const DISPLAY_TIME_ZONE = "Asia/Kolkata";
export const DEFAULT_LOCALE = "en-IN";

const DEFAULT_INSTANT_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZoneName: "short",
};

/**
 * Format a UTC instant in Asia/Kolkata. Any `timeZone` in `options` is
 * overridden, so the display zone can't drift.
 */
export function formatIst(
  instant: Date | string | number,
  options: Intl.DateTimeFormatOptions = DEFAULT_INSTANT_FORMAT,
  locale: string = DEFAULT_LOCALE,
): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid instant");
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: DISPLAY_TIME_ZONE }).format(date);
}

/**
 * A calendar date with no time or zone, such as a date of birth or LMP,
 * held as `YYYY-MM-DD`.
 */
declare const plainDateBrand: unique symbol;
export type PlainDate = string & { readonly [plainDateBrand]: true };

const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function plainDateParts(value: string): [number, number, number] | null {
  const match = PLAIN_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Date.UTC rolls 31 February into March, so a real date reads back unchanged.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return [year, month, day];
}

export function isPlainDate(value: string): value is PlainDate {
  return plainDateParts(value) !== null;
}

/** Parse `YYYY-MM-DD`. Throws RangeError for anything else, including impossible dates. */
export function parsePlainDate(value: string): PlainDate {
  if (!isPlainDate(value)) throw new RangeError("Not a YYYY-MM-DD calendar date");
  return value;
}

/** Format a plain date for display. It is read and written in UTC, so it never shifts a day. */
export function formatPlainDate(
  value: PlainDate,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" },
  locale: string = DEFAULT_LOCALE,
): string {
  const parts = plainDateParts(value);
  if (!parts) throw new RangeError("Not a YYYY-MM-DD calendar date");
  const [year, month, day] = parts;
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

export const plainDateSchema = z
  .string()
  .refine(isPlainDate, { message: "invalid_date" })
  .transform((value) => value as PlainDate);
