import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers/app.js";
import { PhoneEchoController } from "./helpers/test-controllers.js";

// Made-up input that is not an Indian mobile number.
const INVALID_PHONE = "55501 23";

describe("request validation and hygiene", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ controllers: [PhoneEchoController] });
  });
  afterAll(async () => {
    await t.close();
  });

  it("answers an invalid phone with the field path and code, never the value", async () => {
    const res = await t.http
      .post("/api/test/phone")
      .set("Origin", t.origin)
      .send({ phone: INVALID_PHONE });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: "validation_failed",
      requestId: res.headers["x-request-id"],
      fields: [{ path: "phone", code: "invalid_phone" }],
    });
    expect(res.text).not.toContain("55501");
  });

  it("rejects a state-changing request from another origin", async () => {
    const res = await t.http
      .post("/api/test/phone")
      .set("Origin", "https://attacker.example")
      .send({ phone: "9876543210" });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: "forbidden", requestId: res.headers["x-request-id"] });
  });

  it("rejects a state-changing request whose body is not JSON", async () => {
    const res = await t.http
      .post("/api/test/phone")
      .set("Origin", t.origin)
      .set("Content-Type", "text/plain")
      .send("phone=9876543210");

    expect(res.status).toBe(415);
    expect(res.body).toEqual({
      code: "validation_failed",
      requestId: res.headers["x-request-id"],
    });
  });
});
