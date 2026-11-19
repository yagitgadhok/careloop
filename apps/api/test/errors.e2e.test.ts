import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "../src/config/env.js";
import { createTestApp, type TestApp } from "./helpers/app.js";
import { FailingQueryController } from "./helpers/test-controllers.js";

// A made-up phone number; none of its forms may reach a response or a log line.
const PHONE = "98765 43210";
const PHONE_FORMS = ["9876543210", "+919876543210", "98765 43210"];

describe("error responses", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ controllers: [FailingQueryController] });
  });
  afterAll(async () => {
    await t.close();
  });

  it("turns a failing query into a 500 with only a request id, and logs no phone digits", async () => {
    const res = await t.http
      .post("/api/test/failing-query")
      .set("Origin", t.origin)
      .send({ phone: PHONE });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ code: "internal_error", requestId: res.headers["x-request-id"] });
    expect(t.logs.length).toBeGreaterThan(0);
    for (const form of PHONE_FORMS) {
      expect(res.text).not.toContain(form);
      for (const line of t.logs) expect(line).not.toContain(form);
    }
  });
});

describe("startup configuration", () => {
  it("exits naming a missing variable, without printing any value", () => {
    const envModule = pathToFileURL(resolve(import.meta.dirname, "../src/config/env.ts")).href;
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const { loadEnvOrExit } = await import(${JSON.stringify(envModule)}); loadEnvOrExit();`,
      ],
      {
        // An empty value counts as missing, and stops the repo .env from filling it in.
        env: { ...process.env, DATABASE_URL: "", JWT_SECRET: "a-secret-value-that-must-not-print" },
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DATABASE_URL");
    expect(result.stderr).not.toContain("a-secret-value-that-must-not-print");
    expect(result.stderr).not.toContain("postgresql://");
  });
});

describe("TRUST_PROXY", () => {
  // Made-up values that satisfy every other rule.
  const base = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    REDIS_URL: "redis://localhost:6379",
    JWT_SECRET: "x".repeat(32),
    JWT_ISSUER: "issuer",
    JWT_AUDIENCE: "audience",
    OTP_PEPPER: "y".repeat(32),
    PHONE_HASH_PEPPER: "z".repeat(32),
    WEB_ORIGIN: "http://localhost:3000",
    API_PORT: "4000",
  };

  it.each(["local", "test"])("defaults to loopback when APP_ENV is %s", (appEnv) => {
    expect(parseEnv({ ...base, APP_ENV: appEnv }).TRUST_PROXY).toBe("loopback");
  });

  it.each(["staging", "production"])("must be set explicitly when APP_ENV is %s", (appEnv) => {
    let thrown: unknown;
    try {
      parseEnv({ ...base, APP_ENV: appEnv });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(EnvError);
    expect((thrown as EnvError).variables).toEqual(["TRUST_PROXY"]);
    expect(parseEnv({ ...base, APP_ENV: appEnv, TRUST_PROXY: "10.0.0.0/8" }).TRUST_PROXY).toBe(
      "10.0.0.0/8",
    );
  });
});
