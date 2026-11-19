import { Controller, Get, Post, RequestMethod, type Type } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { PERMISSIONS } from "@careloop/shared/permissions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { IS_PUBLIC, IS_SESSION_ONLY, Public } from "../src/common/auth.decorators.js";
import { REQUIRED_PERMISSION } from "../src/common/permission.decorator.js";
import { createTestApp, type TestApp } from "./helpers/app.js";

/** The only routes anyone may call without a session. Adding one is a security review. */
const PUBLIC_ALLOWLIST = [
  "GET /api/health",
  "POST /api/auth/otp/request",
  "POST /api/auth/otp/verify",
  "POST /api/auth/refresh",
];

/** Routes that need a live session but no organisation or permission. */
const SESSION_ONLY = [
  "GET /api/auth/session",
  "POST /api/auth/org/select",
  "POST /api/auth/logout",
  "POST /api/auth/logout-others",
];

interface RouteInfo {
  route: string;
  kind: "public" | "session-only" | "permission" | "undecorated";
  permission?: string;
}

function segments(value: unknown): string {
  const path = Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
  return path.replace(/^\/+|\/+$/g, "");
}

/** Every route the application registers, read from the controllers Nest discovered. */
async function registeredRoutes(extraControllers: Type[] = []): Promise<RouteInfo[]> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, DiscoveryModule],
    controllers: extraControllers,
  }).compile();
  try {
    const discovery = moduleRef.get(DiscoveryService);
    const reflector = moduleRef.get(Reflector);
    const scanner = new MetadataScanner();
    const routes: RouteInfo[] = [];

    for (const wrapper of discovery.getControllers()) {
      const controller = wrapper.metatype as Type | null;
      if (!controller) continue;
      const base = segments(Reflect.getMetadata(PATH_METADATA, controller));
      const prototype = controller.prototype as Record<string, unknown>;
      for (const name of scanner.getAllMethodNames(prototype)) {
        const handler = prototype[name] as (...args: unknown[]) => unknown;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined) continue;
        const path = ["api", base, segments(Reflect.getMetadata(PATH_METADATA, handler))]
          .filter(Boolean)
          .join("/");
        const route = `${RequestMethod[method]} /${path}`;

        const targets = [handler, controller];
        const permission = reflector.getAllAndOverride<string | undefined>(
          REQUIRED_PERMISSION,
          targets,
        );
        if (reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
          routes.push({ route, kind: "public" });
        } else if (reflector.getAllAndOverride<boolean>(IS_SESSION_ONLY, targets)) {
          routes.push({ route, kind: "session-only" });
        } else if (permission) {
          routes.push({ route, kind: "permission", permission });
        } else {
          routes.push({ route, kind: "undecorated" });
        }
      }
    }
    return routes;
  } finally {
    await moduleRef.close();
  }
}

/** What is wrong with the route table: one line per offending route. */
function violations(routes: RouteInfo[]): string[] {
  const known = new Set<string>(PERMISSIONS);
  const problems: string[] = [];
  for (const { route, kind, permission } of routes) {
    if (kind === "undecorated") problems.push(`${route}: no permission decorator`);
    if (kind === "public" && !PUBLIC_ALLOWLIST.includes(route)) {
      problems.push(`${route}: @Public but not on the allowlist`);
    }
    if (kind === "permission" && permission && !known.has(permission)) {
      problems.push(`${route}: unknown permission`);
    }
  }
  return problems;
}

describe("permission coverage", () => {
  let routes: RouteInfo[];

  beforeAll(async () => {
    routes = await registeredRoutes();
  });

  it("finds the application's routes", () => {
    expect(routes.length).toBeGreaterThan(PUBLIC_ALLOWLIST.length + SESSION_ONLY.length);
    expect(routes.map((r) => r.route)).toContain("GET /api/memberships");
  });

  it("gives every route a permission, @SessionOnly, or a place on the @Public allowlist", () => {
    expect(violations(routes)).toEqual([]);
  });

  it("keeps the @Public allowlist and the session-only routes exactly as reviewed", () => {
    const of = (kind: RouteInfo["kind"]) =>
      routes
        .filter((r) => r.kind === kind)
        .map((r) => r.route)
        .sort();
    expect(of("public")).toEqual([...PUBLIC_ALLOWLIST].sort());
    expect(of("session-only")).toEqual([...SESSION_ONLY].sort());
  });

  it("declares the expected permission on each membership route", () => {
    const declared = Object.fromEntries(
      routes
        .filter((r) => r.route.includes("/api/memberships"))
        .map((r) => [r.route, r.permission]),
    );
    expect(declared).toEqual({
      "GET /api/memberships": "members.read",
      "POST /api/memberships": "members.manage",
      "PATCH /api/memberships/:membershipId/roles": "members.manage",
      "POST /api/memberships/:membershipId/deactivate": "members.manage",
      "POST /api/memberships/:membershipId/reactivate": "members.manage",
    });
  });

  it("fails an undecorated route and a @Public route that is not on the allowlist", async () => {
    @Controller("coverage/undecorated")
    class UndecoratedController {
      @Get()
      read() {
        return {};
      }
    }

    @Controller("coverage/public")
    class UnlistedPublicController {
      @Public()
      @Post()
      write() {
        return {};
      }
    }

    const withExtras = await registeredRoutes([UndecoratedController, UnlistedPublicController]);
    expect(violations(withExtras)).toEqual([
      "GET /api/coverage/undecorated: no permission decorator",
      "POST /api/coverage/public: @Public but not on the allowlist",
    ]);
  });
});

describe("session-only routes", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it("returns 401 without a session", async () => {
    const reads = await t.http.get("/api/auth/session");
    expect(reads.status).toBe(401);
    expect(reads.body.code).toBe("unauthenticated");

    for (const path of ["/api/auth/logout", "/api/auth/logout-others"]) {
      const res = await t.http.post(path).set("origin", t.origin);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("unauthenticated");
    }
  });
});
