import { NextResponse, type NextRequest } from "next/server";
import { apiRoutes } from "@careloop/shared/api";
import { sessionResponseSchema, type SessionResponse } from "@careloop/shared/schemas";
import { ACCESS_COOKIE, apiOrigin, REFRESH_COOKIE, SIGNED_OUT_PATH } from "./lib/api/config";

/** Pages anyone can open, signed in or not. */
const PUBLIC_PATHS = ["/sign-in", "/dev"];
/** Pages for signed-in users that do not need a chosen clinic. */
const CLINIC_PICKING_PATHS = ["/choose-clinic", "/no-clinic"];

function matches(pathname: string, paths: readonly string[]): boolean {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

type SessionLookup =
  { kind: "ok"; session: SessionResponse } | { kind: "unauthenticated" } | { kind: "unavailable" };

async function lookUpSession(cookie: string): Promise<SessionLookup> {
  let response: Response;
  try {
    response = await fetch(apiOrigin() + apiRoutes.auth.session.path, {
      method: "GET",
      headers: { accept: "application/json", cookie },
      cache: "no-store",
    });
  } catch {
    return { kind: "unavailable" };
  }
  // Any 401 (expired, missing or revoked token) means the access token can't be used.
  if (response.status === 401) return { kind: "unauthenticated" };
  if (!response.ok) return { kind: "unavailable" };
  const parsed = sessionResponseSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? { kind: "ok", session: parsed.data } : { kind: "unavailable" };
}

type RefreshResult =
  /** New tokens: the API's Set-Cookie headers. */
  | { kind: "ok"; setCookies: string[] }
  /** The API refused the refresh token (401 or 403): the session is over. */
  | { kind: "rejected"; setCookies: string[] }
  /** Network error, 5xx or 429: the session may still be fine. */
  | { kind: "unavailable" };

/** Rotates the tokens with the refresh cookie. */
async function refreshTokens(request: NextRequest, cookie: string): Promise<RefreshResult> {
  let response: Response;
  try {
    response = await fetch(apiOrigin() + apiRoutes.auth.refresh.path, {
      method: apiRoutes.auth.refresh.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        cookie,
        // The API checks the Origin of state-changing requests against the web origin.
        origin: process.env.WEB_ORIGIN ?? request.nextUrl.origin,
      },
      cache: "no-store",
    });
  } catch {
    return { kind: "unavailable" };
  }
  if (response.ok) return { kind: "ok", setCookies: response.headers.getSetCookie() };
  if (response.status === 401 || response.status === 403) {
    return { kind: "rejected", setCookies: response.headers.getSetCookie() };
  }
  return { kind: "unavailable" };
}

/** Applies Set-Cookie values to a Cookie header, so this request already uses the new tokens. */
function mergeCookies(cookieHeader: string, setCookies: readonly string[]): string {
  const jar = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index > 0) jar.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  for (const setCookie of setCookies) {
    const pair = setCookie.split(";")[0] ?? "";
    const index = pair.indexOf("=");
    if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

function redirectTo(request: NextRequest, target: string, setCookies: readonly string[] = []) {
  const response = NextResponse.redirect(new URL(target, request.url));
  for (const setCookie of setCookies) response.headers.append("set-cookie", setCookie);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (matches(pathname, PUBLIC_PATHS)) return NextResponse.next();

  const hasAccess = request.cookies.has(ACCESS_COOKIE);
  // The access cookie lapses after 15 minutes; the refresh cookie can still renew it.
  if (!hasAccess && !request.cookies.has(REFRESH_COOKIE)) return redirectTo(request, "/sign-in");

  let cookie = request.headers.get("cookie") ?? "";
  let setCookies: string[] = [];
  let lookup: SessionLookup = hasAccess ? await lookUpSession(cookie) : { kind: "unauthenticated" };

  // Server components can't set cookies, so the silent refresh happens here.
  if (lookup.kind === "unauthenticated") {
    const refreshed = await refreshTokens(request, cookie);
    if (refreshed.kind === "rejected") {
      return redirectTo(request, SIGNED_OUT_PATH, refreshed.setCookies);
    }
    if (refreshed.kind === "ok") {
      setCookies = refreshed.setCookies;
      cookie = mergeCookies(cookie, setCookies);
      lookup = await lookUpSession(cookie);
      if (lookup.kind === "unauthenticated") return redirectTo(request, SIGNED_OUT_PATH);
    } else {
      lookup = { kind: "unavailable" };
    }
  }

  if (lookup.kind === "ok") {
    const { session } = lookup;
    if (session.organisations.length === 0) {
      if (pathname !== "/no-clinic") return redirectTo(request, "/no-clinic", setCookies);
    } else if (!session.active && !matches(pathname, CLINIC_PICKING_PATHS)) {
      return redirectTo(request, "/choose-clinic", setCookies);
    }
  }
  // If the API is unreachable (lookup or refresh) the page renders and shows its own error state.

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("cookie", cookie);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const setCookie of setCookies) response.headers.append("set-cookie", setCookie);
  return response;
}

export const config = {
  // Skip the API rewrite, Next internals and static files.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
