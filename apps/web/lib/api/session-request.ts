import {
  ApiError,
  apiRoutes,
  createApiClient,
  isSessionEnded,
  type RouteDef,
  type RouteInput,
  type RouteOutput,
} from "@careloop/shared/api";
import { ErrorCode } from "@careloop/shared/errors";

/** Same-origin client: the browser sends the auth cookies itself. */
export const client = createApiClient({
  fetch: (url, init) => fetch(url, { ...init, credentials: "same-origin", cache: "no-store" }),
});

/** The API only accepts JSON on state-changing requests, including ones with no body. */
export function withJsonHeader<R extends RouteDef>(route: R, input: RouteInput<R>): RouteInput<R> {
  if (route.method === "GET") return input;
  const headers = { ...input.headers, "content-type": "application/json" };
  return { ...input, headers } as RouteInput<R>;
}

type RefreshResult =
  | { kind: "ok" }
  /** The API refused the refresh token: the session is over. */
  | { kind: "ended" }
  /** Network error, 5xx or 429: the session may be fine; `error` is what the refresh threw. */
  | { kind: "unavailable"; error: unknown };

// Several calls can fail at once when the access token expires; they share one refresh.
let refreshing: Promise<RefreshResult> | null = null;

function refreshSession(): Promise<RefreshResult> {
  refreshing ??= client
    .request(apiRoutes.auth.refresh, withJsonHeader(apiRoutes.auth.refresh, {}))
    .then(
      (): RefreshResult => ({ kind: "ok" }),
      (error: unknown): RefreshResult =>
        isSessionEnded(error) ? { kind: "ended" } : { kind: "unavailable", error },
    )
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * Calls the API; an expired access token is refreshed once and the call
 * retried. When the session is gone, returns `sessionLost()` instead. When the
 * refresh fails for another reason (network, 5xx, 429), throws that error.
 */
export async function requestWithRefresh<R extends RouteDef>(
  route: R,
  input: RouteInput<R>,
  sessionLost: () => Promise<never>,
): Promise<RouteOutput<R>> {
  const prepared = withJsonHeader(route, input);
  try {
    return await client.request(route, prepared);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.code === ErrorCode.session_revoked) return sessionLost();
    if (error.code === ErrorCode.unauthenticated) {
      const refreshed = await refreshSession();
      if (refreshed.kind === "ended") return sessionLost();
      // A transient failure is not a lost session: the caller shows its own error.
      if (refreshed.kind === "unavailable") throw refreshed.error;
      try {
        return await client.request(route, prepared);
      } catch (retryError) {
        if (isSessionEnded(retryError)) return sessionLost();
        throw retryError;
      }
    }
    throw error;
  }
}
