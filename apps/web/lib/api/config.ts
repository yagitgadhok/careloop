/** Auth cookie names. The API sets both; the web only checks that the access cookie is present. */
export const ACCESS_COOKIE = "__Host-careloop_at";
export const REFRESH_COOKIE = "__Host-careloop_rt";

/** Where server-side code reaches the API directly. */
export function apiOrigin(): string {
  return process.env.API_ORIGIN ?? "http://localhost:4000";
}

/** Where to send someone whose session has ended. */
export const SIGNED_OUT_PATH = "/sign-in?reason=signed_out";
