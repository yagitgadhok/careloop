import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ACCESS_COOKIE } from "@careloop/shared/auth-cookies";
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
});
