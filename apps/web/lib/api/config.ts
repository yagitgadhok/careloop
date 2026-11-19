/** The API sets the auth cookies; the web only checks that the access cookie is present. */
export { ACCESS_COOKIE } from "@careloop/shared/auth-cookies";

/** Where server-side code reaches the API directly. */
export function apiOrigin(): string {
  return process.env.API_ORIGIN ?? "http://localhost:4000";
}

/** Where to send someone whose session has ended. */
export const SIGNED_OUT_PATH = "/sign-in?reason=signed_out";
