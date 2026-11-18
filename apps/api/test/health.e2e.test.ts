import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { REDIS } from "../src/infra/tokens.js";
import { createTestApp, type TestApp } from "./helpers/app.js";

describe("GET /api/health", () => {
  const apps: TestApp[] = [];
  afterAll(async () => {
    for (const t of apps) await t.close();
  });

  it("is OK when Postgres and Redis are up", async () => {
    const t = await createTestApp();
    apps.push(t);

    const res = await t.http.get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("is 503 when Redis is down", async () => {
    // Nothing listens on port 1, so every Redis command fails.
    const deadRedis = new Redis("redis://127.0.0.1:1", {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
    });
    deadRedis.on("error", () => undefined);
    const t = await createTestApp({ overrides: [{ token: REDIS, value: deadRedis }] });
    apps.push(t);

    const res = await t.http.get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false });
  });
});
