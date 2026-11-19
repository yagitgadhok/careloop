import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../../src/auth/cookies.js";
import {
  cookieHeader,
  cookieValue,
  createAuthTestApp,
  createClinic,
  MINUTE,
  randomIp,
  randomPhone,
  SECOND,
  setCookies,
  type AuthTestApp,
} from "../helpers/auth.js";

let t: AuthTestApp;

beforeAll(async () => {
  t = await createAuthTestApp();
});

afterAll(async () => {
  await t.close();
});

async function signedIn() {
  const phone = randomPhone();
  const clinic = await createClinic(t.db, phone);
  const { res, cookie } = await t.signIn(phone);
  return { phone, clinic, res, cookie };
}

/** POST /api/auth/refresh the way the web's proxy does: cookie and Origin, no body. */
function refresh(cookie: string) {
  return t.post("/api/auth/refresh", randomIp(), undefined, cookie);
}

describe("cookies", () => {
  it("sets both cookies as __Host- cookies on Path=/, httpOnly, Secure and SameSite=Lax", async () => {
    const { res } = await signedIn();
    const lines = setCookies(res);
    for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
      expect(name.startsWith("__Host-")).toBe(true);
      const line = lines.find((l) => l.startsWith(`${name}=`));
      expect(line).toBeDefined();
      expect(line).toContain("Path=/");
      expect(line).toContain("HttpOnly");
      expect(line).toContain("Secure");
      expect(line).toContain("SameSite=Lax");
      expect(line?.toLowerCase()).not.toContain("domain=");
    }
  });

  it("returns the session for the signed-in user", async () => {
    const { clinic, cookie } = await signedIn();
    const res = await t.get("/api/auth/session", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      userId: clinic.ownerUserId,
      organisations: [
        {
          organisationId: clinic.organisationId,
          organisationName: "Test clinic",
          roles: ["owner"],
        },
      ],
      active: {
        organisationId: clinic.organisationId,
        organisationName: "Test clinic",
        roles: ["owner"],
      },
    });
  });

  it("answers 401 unauthenticated without a valid access token", async () => {
    expect((await t.get("/api/auth/session")).body.code).toBe("unauthenticated");
    const forged = await t.get("/api/auth/session", `${ACCESS_COOKIE}=not.a.token`);
    expect(forged.status).toBe(401);
    expect(forged.body.code).toBe("unauthenticated");
  });
});

describe("refresh", () => {
  it("succeeds from the web proxy after the access token expires, and rotates the refresh token", async () => {
    const { cookie } = await signedIn();
    t.clock.advance(16 * MINUTE);
    const expired = await t.get("/api/auth/session", cookie);
    expect(expired.status).toBe(401);
    expect(expired.body.code).toBe("unauthenticated");

    const res = await refresh(cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const rotated = cookieValue(res, REFRESH_COOKIE);
    expect(rotated).toBeTruthy();
    expect(cookie).not.toContain(`${REFRESH_COOKIE}=${rotated}`);

    const next = cookieHeader(res, cookie);
    expect((await t.get("/api/auth/session", next)).status).toBe(200);
  });

  it("lets two refreshes with the same token inside the grace window both succeed", async () => {
    const { cookie } = await signedIn();
    const [a, b] = await Promise.all([refresh(cookie), refresh(cookie)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    t.clock.advance(9 * SECOND);
    expect((await refresh(cookie)).status).toBe(200);
  });

  it("revokes the whole family when an old token is reused after the grace window", async () => {
    const { cookie } = await signedIn();
    const first = await refresh(cookie);
    const current = cookieHeader(first, cookie);

    t.clock.advance(11 * SECOND);
    const reuse = await refresh(cookie);
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe("unauthenticated");
    expect(cookieValue(reuse, REFRESH_COOKIE)).toBe("");

    expect((await refresh(current)).status).toBe(401);
    const session = await t.get("/api/auth/session", current);
    expect(session.status).toBe(401);
    expect(session.body.code).toBe("session_revoked");
  });

  it("fails without a refresh cookie", async () => {
    const res = await refresh("");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("unauthenticated");
  });
});

describe("sign-out", () => {
  it("logout revokes this session and clears both cookies", async () => {
    const { cookie } = await signedIn();
    const res = await t.post("/api/auth/logout", randomIp(), undefined, cookie);
    expect(res.status).toBe(200);
    expect(cookieValue(res, ACCESS_COOKIE)).toBe("");
    expect(cookieValue(res, REFRESH_COOKIE)).toBe("");

    const after = await t.get("/api/auth/session", cookie);
    expect(after.status).toBe(401);
    expect(after.body.code).toBe("session_revoked");
    expect((await refresh(cookie)).status).toBe(401);
  });

  it("logout-others makes the other session's next request fail and keeps this one", async () => {
    const phone = randomPhone();
    await createClinic(t.db, phone);
    const laptop = await t.signIn(phone);
    t.clock.advance(31 * SECOND);
    const phoneApp = await t.signIn(phone);

    const res = await t.post("/api/auth/logout-others", randomIp(), undefined, phoneApp.cookie);
    expect(res.status).toBe(200);

    const other = await t.get("/api/auth/session", laptop.cookie);
    expect(other.status).toBe(401);
    expect(other.body.code).toBe("session_revoked");
    expect((await t.get("/api/auth/session", phoneApp.cookie)).status).toBe(200);
  });

  it("refuses a disabled user's next request", async () => {
    const { clinic, cookie } = await signedIn();
    await t.db.withSystem("auth", (sys) =>
      sys.user.update({ where: { id: clinic.ownerUserId }, data: { status: "disabled" } }),
    );
    const res = await t.get("/api/auth/session", cookie);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("session_revoked");
  });

  it("requires a session for logout", async () => {
    const res = await t.post("/api/auth/logout", randomIp());
    expect(res.status).toBe(401);
  });
});

describe("security events", () => {
  it("records sign-in outcomes with hashed phone and IP only", async () => {
    const phone = randomPhone();
    await createClinic(t.db, phone);
    const ip = randomIp();
    await t.signIn(phone, ip);
    const events = await t.db.withSystem("auth", (sys) =>
      sys.securityEvent.findMany({ where: { phoneHash: t.keys.phoneHash(phone) } }),
    );
    const types = events.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["otp.requested", "otp.sent", "otp.verified"]));
    for (const event of events) {
      expect(event.ipHash).toBe(t.keys.ipHash(ip));
      expect(JSON.stringify(event)).not.toContain(phone.slice(-10));
    }
  });
});
