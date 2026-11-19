import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@careloop/shared/auth-cookies";
import { proxy } from "../proxy";

const userId = "6f1c1f4e-8f0a-4a52-9a37-1d1b3c0b7a10";

function requestTo(path: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}

function redirectPath(response: Response): string | null {
  const location = response.headers.get("location");
  return location ? new URL(location).pathname : null;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("proxy routing", () => {
  it("sends a signed-out request for /team to sign-in without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(requestTo("/team"));

    expect(redirectPath(response)).toBe("/sign-in");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a session with zero active memberships to /no-clinic", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ userId, organisations: [], active: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(requestTo("/team", `${ACCESS_COOKIE}=token`));

    expect(redirectPath(response)).toBe("/no-clinic");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/auth\/session$/);
    expect(new Headers(init.headers).get("cookie")).toContain(`${ACCESS_COOKIE}=token`);
  });

  it("refreshes first when only the refresh cookie is left, then renders with the new cookies", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/auth/refresh")) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: [
            ["content-type", "application/json"],
            ["set-cookie", `${ACCESS_COOKIE}=fresh; Path=/; HttpOnly; Secure`],
            ["set-cookie", `${REFRESH_COOKIE}=rotated; Path=/; HttpOnly; Secure`],
          ],
        });
      }
      return new Response(JSON.stringify(activeSession), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(requestTo("/team", `${REFRESH_COOKIE}=old`));

    expect(redirectPath(response)).toBeNull();
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([url]) => new URL(url).pathname)).toEqual([
      "/api/auth/refresh",
      "/api/auth/session",
    ]);
    expect(new Headers(calls[0]?.[1].headers).get("cookie")).toBe(`${REFRESH_COOKIE}=old`);
    expect(new Headers(calls[1]?.[1].headers).get("cookie")).toContain(`${ACCESS_COOKIE}=fresh`);
    const setCookies = response.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith(`${ACCESS_COOKIE}=fresh`))).toBe(true);
    expect(setCookies.some((c) => c.startsWith(`${REFRESH_COOKIE}=rotated`))).toBe(true);
  });

  it("sends a request with neither cookie to /sign-in", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(requestTo("/team", "unrelated=1"));

    expect(redirectPath(response)).toBe("/sign-in");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signs out when the refresh is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      sessionThenRefresh(() => jsonStatus(401)),
    );

    const response = await proxy(requestTo("/team", bothCookies));

    expect(redirectPath(response)).toBe("/sign-in");
    expect(new URL(response.headers.get("location") ?? "").searchParams.get("reason")).toBe(
      "signed_out",
    );
  });

  it.each([
    ["a 500", () => jsonStatus(500)],
    ["a 429", () => jsonStatus(429)],
    [
      "a network error",
      () => {
        throw new TypeError("fetch failed");
      },
    ],
  ])("renders the page when the refresh fails with %s", async (_label, refreshResult) => {
    const fetchMock = sessionThenRefresh(refreshResult);
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(requestTo("/team", bothCookies));

    expect(redirectPath(response)).toBeNull();
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

const activeSession = {
  userId,
  organisations: [
    {
      organisationId: "0b3e4f5a-6c7d-4e8f-9a0b-1c2d3e4f5a6b",
      organisationName: "Made-up clinic",
      roles: ["doctor"],
    },
  ],
  active: {
    organisationId: "0b3e4f5a-6c7d-4e8f-9a0b-1c2d3e4f5a6b",
    organisationName: "Made-up clinic",
    roles: ["doctor"],
  },
};

const bothCookies = `${ACCESS_COOKIE}=stale; ${REFRESH_COOKIE}=old`;

function jsonStatus(status: number): Response {
  return new Response(JSON.stringify({ code: "x" }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** The session lookup answers 401; the refresh answers with `refreshResult`. */
function sessionThenRefresh(refreshResult: () => Response) {
  return vi.fn(async (url: string) => {
    if (url.endsWith("/api/auth/refresh")) return refreshResult();
    return jsonStatus(401);
  });
}
