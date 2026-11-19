import { createHmac } from "node:crypto";
import { toIndianMobile } from "@careloop/shared/schemas";

export interface SecurityKeyOptions {
  /** Server-side pepper for HMACing phone numbers and IPs. */
  phonePepper: string;
}

/**
 * The one source of phone/IP hashes and of the Redis key names for sign-in
 * rate limits, shared by the API and the operator commands so their formats
 * cannot drift apart. Hashes and keys never contain phone digits or raw IPs.
 */
export function createSecurityKeys({ phonePepper }: SecurityKeyOptions) {
  if (phonePepper.length < 16) {
    throw new Error("The phone hash pepper must be at least 16 characters");
  }
  const hmac = (kind: string, value: string) =>
    createHmac("sha256", phonePepper).update(`${kind}:${value}`).digest("base64url");

  /** Hashes a phone after normalising it, so every spelling of one number matches. */
  const phoneHash = (phone: string): string => hmac("phone", toIndianMobile(phone) ?? phone.trim());
  const ipHash = (ip: string): string => hmac("ip", ip);

  const otp = {
    /** Failed verify attempts for one phone from one IP. */
    failures: (phone: string, ip: string) => `otp:fail:${phone}:${ip}`,
    /** Lockout flag for one phone from one IP. */
    lockout: (phone: string, ip: string) => `otp:lock:${phone}:${ip}`,
    /** Codes sent today to one phone at the request of one IP. */
    dailySends: (phone: string, ip: string) => `otp:sends:${phone}:${ip}`,
    /** Minimum gap between two codes for one phone. */
    resendGap: (phone: string) => `otp:gap:${phone}`,
    /** Failed verify attempts for one phone across all IPs in the current hour (backstop). */
    phoneFailures: (phone: string) => `otp:phonefail:${phone}`,
    /** When the phone-wide failure window ends (epoch ms). */
    phoneFailuresWindow: (phone: string) => `otp:phonefailwin:${phone}`,
    /** Codes sent to one phone across all IPs in the current hour (backstop). */
    phoneSends: (phone: string) => `otp:phonesends:${phone}`,
    /** When the phone-wide send window ends (epoch ms). */
    phoneSendsWindow: (phone: string) => `otp:phonesendswin:${phone}`,
    /** Sign-in requests from one IP in the current hour. */
    ipRequests: (ip: string) => `otp:ip:${ip}`,
    /** Where the test sender leaves the latest code for one phone (tests only). */
    testCode: (phone: string) => `test:otp:${phone}`,
    /** Key patterns covering every counter for one phone, for an operator unlock. */
    allForPhone: (phone: string) => [
      `otp:fail:${phone}:*`,
      `otp:lock:${phone}:*`,
      `otp:sends:${phone}:*`,
      `otp:gap:${phone}`,
      `otp:phonefail:${phone}`,
      `otp:phonefailwin:${phone}`,
      `otp:phonesends:${phone}`,
      `otp:phonesendswin:${phone}`,
    ],
  };

  return { phoneHash, ipHash, otp };
}

export type SecurityKeys = ReturnType<typeof createSecurityKeys>;
