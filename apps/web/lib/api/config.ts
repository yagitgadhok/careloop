/** The API sets the auth cookies; the web only checks which of them are present. */
export { ACCESS_COOKIE, REFRESH_COOKIE } from "@careloop/shared/auth-cookies";

/** Where server-side code reaches the API directly. */
export function apiOrigin(): string {
  return process.env.API_ORIGIN ?? "http://localhost:4000";
}

/** Where to send someone whose session has ended. */
export const SIGNED_OUT_PATH = "/sign-in?reason=signed_out";
