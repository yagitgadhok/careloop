"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
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
import { useToast } from "../../components/toaster";
import { SIGNED_OUT_PATH } from "./config";

/** Same-origin client: the browser sends the auth cookies itself. */
const client = createApiClient({
  fetch: (url, init) => fetch(url, { ...init, credentials: "same-origin", cache: "no-store" }),
});

/** The API only accepts JSON on state-changing requests, including ones with no body. */
function withJsonHeader<R extends RouteDef>(route: R, input: RouteInput<R>): RouteInput<R> {
  if (route.method === "GET") return input;
  const headers = { ...input.headers, "content-type": "application/json" };
  return { ...input, headers } as RouteInput<R>;
}

// Several calls can fail at once when the access token expires; they share one refresh.
let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshing ??= client
    .request(apiRoutes.auth.refresh, withJsonHeader(apiRoutes.auth.refresh, {}))
    .then(
      () => true,
      () => false,
    )
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

let leaving = false;

export interface BrowserApi {
  request<R extends RouteDef>(route: R, input: RouteInput<R>): Promise<RouteOutput<R>>;
}

/**
 * API client for client components. An expired access token is refreshed once
 * and the call retried. If the session is gone, the user sees a toast and is
 * sent to sign-in; the failed call then never settles, so no other error shows.
 */
export function useApi(): BrowserApi {
  const toast = useToast();
  const t = useTranslations("session");

  return useMemo(() => {
    const sessionLost = (): Promise<never> => {
      if (!leaving) {
        leaving = true;
        toast({ title: t("lostTitle"), description: t("lostBody"), variant: "destructive" });
        window.setTimeout(() => window.location.assign(SIGNED_OUT_PATH), 1500);
      }
      return new Promise<never>(() => {});
    };

    return {
      async request<R extends RouteDef>(route: R, input: RouteInput<R>) {
        const prepared = withJsonHeader(route, input);
        try {
          return await client.request(route, prepared);
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
          if (error.code === ErrorCode.session_revoked) return sessionLost();
          if (error.code === ErrorCode.unauthenticated) {
            if (!(await refreshSession())) return sessionLost();
            try {
              return await client.request(route, prepared);
            } catch (retryError) {
              if (isSessionEnded(retryError)) return sessionLost();
              throw retryError;
            }
          }
          throw error;
        }
      },
    };
  }, [toast, t]);
}

/** Signs out this device, then goes to sign-in whatever the API answered. */
export async function signOut(): Promise<void> {
  try {
    await client.request(apiRoutes.auth.logout, withJsonHeader(apiRoutes.auth.logout, {}));
  } catch {
    // The cookies may already be gone; sign-in is the right place either way.
  }
  window.location.assign("/sign-in");
}
