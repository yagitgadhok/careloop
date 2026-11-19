/**
 * Money is integer paise everywhere. A single stored amount fits a JS number;
 * totals can pass the database `int` range, so they are summed as bigint.
 */

declare const paiseBrand: unique symbol;
export type Paise = number & { readonly [paiseBrand]: true };

/** Brand an integer as paise. Throws RangeError for fractions, NaN or unsafe integers. */
export function paise(value: number): Paise {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Paise must be a safe integer");
  }
  return value as Paise;
}

const RUPEES = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** Parse a rupee amount such as "1,234.5" or "₹ 99" into paise, without floats. */
export function parseRupees(input: string): Paise {
  const cleaned = input.trim().replace(/^₹\s*/, "").replace(/,/g, "");
  const match = RUPEES.exec(cleaned);
  if (!match) throw new RangeError("Not a rupee amount");
  const [, sign, whole = "0", fraction = ""] = match;
  const total = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return bigintToPaise(sign ? -total : total);
}

/** Group digits the Indian way: last three, then pairs (1,23,45,678). */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  return `${head.replace(/\B(?=(\d{2})+$)/g, ",")},${tail}`;
}

/** Format paise as "₹1,23,456.78", always with two decimals. Accepts bigint totals. */
export function formatPaise(amount: Paise | bigint): string {
  const value = BigInt(amount);
  const abs = value < 0n ? -value : value;
  const rupees = groupIndian((abs / 100n).toString());
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${value < 0n ? "-" : ""}₹${rupees}.${fraction}`;
}

/** Add amounts exactly. Throws RangeError if the result leaves the safe-integer range. */
export function addPaise(...values: Paise[]): Paise {
  return bigintToPaise(sumPaiseBig(values));
}

/** Sum amounts as bigint, for totals that can pass 2^31. */
export function sumPaiseBig(values: Iterable<Paise | bigint>): bigint {
  let total = 0n;
  for (const value of values) total += BigInt(value);
  return total;
}

export function paiseToBigint(amount: Paise): bigint {
  return BigInt(amount);
}

/** Convert a bigint total back to paise. Throws RangeError if it does not fit a safe integer. */
export function bigintToPaise(amount: bigint): Paise {
  if (amount > BigInt(Number.MAX_SAFE_INTEGER) || amount < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError("Amount is outside the safe-integer range");
  }
  return Number(amount) as Paise;
}
