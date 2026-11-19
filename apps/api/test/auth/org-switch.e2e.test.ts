import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAuthTestApp,
  createClinic,
  randomIp,
  randomPhone,
  type AuthTestApp,
} from "../helpers/auth.js";
import { WhoAmIController } from "../helpers/test-controllers.js";

let t: AuthTestApp;

beforeAll(async () => {
  t = await createAuthTestApp({ controllers: [WhoAmIController] });
});

afterAll(async () => {
  await t.close();
});

/** A doctor-owner with memberships in two clinics. */
async function twoClinicUser() {
  const phone = randomPhone();
  const a = await createClinic(t.db, phone, "Clinic A");
  const b = await createClinic(t.db, phone, "Clinic B");
  const { res, cookie } = await t.signIn(phone);
  return { phone, a, b, res, cookie, userId: a.ownerUserId };
}

function select(cookie: string, organisationId: string) {
  return t.post("/api/auth/org/select", randomIp(), { organisationId }, cookie);
}

async function auditRows(organisationId: string, sessionEntity?: string) {
  return t.db.withTenant(organisationId, ({ tx }) =>
    tx.auditLog.findMany({
      where: sessionEntity ? { entityIds: { has: sessionEntity } } : {},
      orderBy: { createdAt: "asc" },
    }),
  );
}

async function sessionIdOf(userId: string): Promise<string> {
  const sessions = await t.db.withSystem("auth", (sys) =>
    sys.session.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 1 }),
  );
  return sessions[0]?.id ?? "";
}

describe("choosing an organisation", () => {
  it("lists both clinics at verify and refuses organisation routes until one is chosen", async () => {
    const { a, b, res, cookie } = await twoClinicUser();
    const ids = (res.body.organisations as Array<{ organisationId: string }>)
      .map((o) => o.organisationId)
      .sort();
    expect(ids).toEqual([a.organisationId, b.organisationId].sort());

    const session = await t.get("/api/auth/session", cookie);
    expect(session.body.active).toBeNull();

    const before = await t.get("/api/test/whoami", cookie);
    expect(before.status).toBe(403);
    expect(before.body.code).toBe("org_not_selected");
  });

  it("stays scoped to the chosen clinic even when a request names the other one", async () => {
    const { a, b, cookie } = await twoClinicUser();
    const chosen = await select(cookie, a.organisationId);
    expect(chosen.status).toBe(200);
    expect(chosen.body).toEqual({ organisationId: a.organisationId, roles: ["owner"] });

    const viaHeader = await t.get("/api/test/whoami", cookie, {
      "x-organisation-id": b.organisationId,
    });
    expect(viaHeader.body).toEqual({ organisationId: a.organisationId, roles: ["owner"] });

    const viaBody = await t.post(
      `/api/test/whoami?organisationId=${b.organisationId}`,
      randomIp(),
      { organisationId: b.organisationId },
      cookie,
    );
    expect(viaBody.body).toEqual({ organisationId: a.organisationId, roles: ["owner"] });
  });

  it("writes a sign-in audit row scoped to the chosen clinic, and a switch row on switching", async () => {
    const { a, b, cookie, userId } = await twoClinicUser();
    const sessionId = await sessionIdOf(userId);

    await select(cookie, a.organisationId);
    const signIn = await auditRows(a.organisationId, sessionId);
    expect(signIn).toHaveLength(1);
    expect(signIn[0]).toMatchObject({
      action: "auth.sign_in",
      actorType: "user",
      actorId: userId,
      entityType: "session",
      organisationId: a.organisationId,
    });
    expect(await auditRows(b.organisationId, sessionId)).toHaveLength(0);

    await select(cookie, b.organisationId);
    const switched = await auditRows(b.organisationId, sessionId);
    expect(switched.map((r) => r.action)).toEqual(["auth.org_switch"]);
    expect((await t.get("/api/test/whoami", cookie)).body.organisationId).toBe(b.organisationId);

    await t.post("/api/auth/logout", randomIp(), undefined, cookie);
    const signOut = await auditRows(b.organisationId, sessionId);
    expect(signOut.map((r) => r.action)).toEqual(["auth.org_switch", "auth.sign_out"]);
  });

  it("auto-selects the only clinic at verify and audits the sign-in", async () => {
    const phone = randomPhone();
    const clinic = await createClinic(t.db, phone);
    const { res, cookie } = await t.signIn(phone);
    expect(res.body.organisations).toHaveLength(1);
    const sessionId = await sessionIdOf(clinic.ownerUserId);
    expect((await auditRows(clinic.organisationId, sessionId)).map((r) => r.action)).toEqual([
      "auth.sign_in",
    ]);
    expect((await t.get("/api/test/whoami", cookie)).body.organisationId).toBe(
      clinic.organisationId,
    );
  });

  it("refuses a clinic the user does not belong to", async () => {
    const { cookie } = await twoClinicUser();
    const stranger = await createClinic(t.db, randomPhone(), "Clinic C");
    const res = await select(cookie, stranger.organisationId);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden");
  });

  it("refuses a clinic where the membership is deactivated", async () => {
    const { a, b, cookie } = await twoClinicUser();
    await t.db.withTenant(b.organisationId, ({ tx }) =>
      tx.membership.update({
        where: { id: b.ownerMembershipId },
        data: { status: "deactivated", deactivatedAt: new Date() },
      }),
    );
    expect((await select(cookie, b.organisationId)).status).toBe(403);
    expect((await select(cookie, a.organisationId)).status).toBe(200);
  });

  it("needs a session to choose", async () => {
    const res = await t.post("/api/auth/org/select", randomIp(), {
      organisationId: "00000000-0000-4000-8000-000000000001",
    });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("unauthenticated");
  });
});
