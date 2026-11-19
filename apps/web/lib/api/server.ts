import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError, apiRoutes, createApiClient } from "@careloop/shared/api";
import { ErrorCode } from "@careloop/shared/errors";
import type { SessionResponse } from "@careloop/shared/schemas";
import { apiOrigin, SIGNED_OUT_PATH } from "./config";

/**
 * API client for server components. It calls the API directly and forwards the
 * incoming cookie header, so the API sees the signed-in user.
 */
export async function serverApi() {
  const cookie = (await headers()).get("cookie");
  return createApiClient({
    baseUrl: apiOrigin(),
    fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
    headers: (): Record<string, string> => (cookie ? { cookie } : {}),
  });
}

/**
 * The signed-in user's session, fetched once per render. `proxy.ts` has already
 * routed signed-out users away, so an auth failure here means the session ended
 * mid-request.
 */
export const getSession = cache(async (): Promise<SessionResponse> => {
  const api = await serverApi();
  try {
    return await api.request(apiRoutes.auth.session, {});
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.code === ErrorCode.unauthenticated || error.code === ErrorCode.session_revoked)
    ) {
      redirect(SIGNED_OUT_PATH);
    }
    throw error;
  }
});
