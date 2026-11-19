"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { apiRoutes, type RouteDef, type RouteInput, type RouteOutput } from "@careloop/shared/api";
import { useToast } from "../../components/toaster";
import { SIGNED_OUT_PATH } from "./config";
import { client, requestWithRefresh, withJsonHeader } from "./session-request";

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
      request: <R extends RouteDef>(route: R, input: RouteInput<R>) =>
        requestWithRefresh(route, input, sessionLost),
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
