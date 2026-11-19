import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRoutes } from "@careloop/shared/api";
import { requestWithRefresh } from "../lib/api/session-request";

const route = apiRoutes.auth.session;
const session = { userId: "6f1c1f4e-8f0a-4a52-9a37-1d1b3c0b7a10", organisations: [], active: null };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const unauthenticated = () => json(401, { code: "unauthenticated", requestId: "r1" });

/** The first session call answers 401; the refresh answers with `refresh`; later calls succeed. */
function expiredAccessToken(refresh: () => Response) {
  let sessionCalls = 0;
  return vi.fn(async (url: string) => {
    if (url.endsWith("/api/auth/refresh")) return refresh();
    sessionCalls += 1;
    return sessionCalls === 1 ? unauthenticated() : json(200, session);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestWithRefresh", () => {
  it("refreshes once and retries when the access token has expired", async () => {
    vi.stubGlobal(
      "fetch",
      expiredAccessToken(() => json(200, { ok: true })),
    );
    const sessionLost = vi.fn(() => new Promise<never>(() => {}));

    await expect(requestWithRefresh(route, {}, sessionLost)).resolves.toEqual(session);
    expect(sessionLost).not.toHaveBeenCalled();
  });

  it("reports the session lost when the refresh is refused", async () => {
    vi.stubGlobal("fetch", expiredAccessToken(unauthenticated));
    const lost = new Error("session lost");
    const sessionLost = vi.fn(() => Promise.reject(lost));

    await expect(requestWithRefresh(route, {}, sessionLost)).rejects.toBe(lost);
    expect(sessionLost).toHaveBeenCalledOnce();
  });

  it("throws the refresh's own error, not session lost, when the API answers 500", async () => {
    vi.stubGlobal(
      "fetch",
      expiredAccessToken(() => json(500, { code: "internal_error", requestId: "r2" })),
    );
    const sessionLost = vi.fn(() => new Promise<never>(() => {}));

    const error: unknown = await requestWithRefresh(route, {}, sessionLost).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("internal_error");
    expect(sessionLost).not.toHaveBeenCalled();
  });

  it("throws the network error, not session lost, when the refresh cannot reach the API", async () => {
    const offline = new TypeError("fetch failed");
    vi.stubGlobal(
      "fetch",
      expiredAccessToken(() => {
        throw offline;
      }),
    );
    const sessionLost = vi.fn(() => new Promise<never>(() => {}));

    await expect(requestWithRefresh(route, {}, sessionLost)).rejects.toBe(offline);
    expect(sessionLost).not.toHaveBeenCalled();
  });
});
