import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, parseLogs, type TestApp } from "./helpers/app.js";

describe("request logging", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("logs the route template, never the query string", async () => {
    const res = await t.http.get("/api/health?phone=9876543210");
    const requestId = res.headers["x-request-id"];

    const line = parseLogs(t.logs).find((entry) => entry["requestId"] === requestId);
    expect(line).toMatchObject({ method: "GET", route: "/api/health", status: res.status });
    for (const raw of t.logs) {
      expect(raw).not.toContain("9876543210");
      expect(raw).not.toContain("phone=");
    }
  });
});
