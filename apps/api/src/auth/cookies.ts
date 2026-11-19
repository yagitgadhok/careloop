interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge?: number;
}

/** The part of the Express response the auth cookies need. */
export interface CookieResponse {
  cookie(name: string, value: string, options: CookieOptions): unknown;
  clearCookie(name: string, options: CookieOptions): unknown;
}

/** Access token (JWT, 15 minutes). */
export const ACCESS_COOKIE = "__Host-careloop_at";
/** Refresh token (opaque, rotating; lives as long as the session). */
export const REFRESH_COOKIE = "__Host-careloop_rt";

// `__Host-` cookies must be Secure, have Path=/ and carry no Domain.
const BASE: CookieOptions = { httpOnly: true, secure: true, sameSite: "lax", path: "/" };

export function setAccessCookie(res: CookieResponse, token: string, maxAgeMs: number): void {
  res.cookie(ACCESS_COOKIE, token, { ...BASE, maxAge: maxAgeMs });
}

export function setRefreshCookie(res: CookieResponse, token: string, maxAgeMs: number): void {
  res.cookie(REFRESH_COOKIE, token, { ...BASE, maxAge: Math.max(0, maxAgeMs) });
}

export function clearAuthCookies(res: CookieResponse): void {
  res.clearCookie(ACCESS_COOKIE, BASE);
  res.clearCookie(REFRESH_COOKIE, BASE);
}

/** One cookie from a request already parsed by cookie-parser. */
export function readCookie(req: { cookies?: unknown }, name: string): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
