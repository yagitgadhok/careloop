import { Controller, Get } from "@nestjs/common";
import { membershipListSchema, membershipSchema, type Role } from "@careloop/shared/schemas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAuthTestApp,
  createClinic,
  randomIp,
  randomPhone,
  SECOND,
  type AuthTestApp,
} from "./helpers/auth.js";
import { WhoAmIController } from "./helpers/test-controllers.js";

/** A route with no permission decorator: the permission guard must refuse it. */
@Controller("test/undecorated")
class UndecoratedController {
  @Get()
  read() {
    return { reached: true };
  }
}

let t: AuthTestApp;

beforeAll(async () => {
  t = await createAuthTestApp({ controllers: [WhoAmIController, UndecoratedController] });
});

afterAll(async () => {
  await t.close();
});

/** A made-up clinic and its signed-in owner. */
async function ownedClinic(name = "Test clinic") {
  const phone = randomPhone();
  const clinic = await createClinic(t.db, phone, name);
  const { cookie } = await t.signIn(phone);
  return { phone, clinic, cookie, organisationId: clinic.organisationId };
}

function invite(cookie: string, phone: string, roles: Role[]) {
  return t.post("/api/memberships", randomIp(), { phone, roles }, cookie);
}

function changeRoles(cookie: string, membershipId: string, roles: Role[]) {
  return t.http
    .patch(`/api/memberships/${membershipId}/roles`)
    .set("origin", t.origin)
    .set("cookie", cookie)
    .send({ roles });
}

function deactivate(cookie: string, membershipId: string) {
  return t.post(`/api/memberships/${membershipId}/deactivate`, randomIp(), undefined, cookie);
}

function reactivate(cookie: string, membershipId: string) {
  return t.post(`/api/memberships/${membershipId}/reactivate`, randomIp(), undefined, cookie);
}

/** Invites `roles` into the owner's clinic and signs the new member in. */
async function member(ownerCookie: string, roles: Role[]) {
  const phone = randomPhone();
  const invited = await invite(ownerCookie, phone, roles);
  expect(invited.status).toBe(201);
  const membershipId = (invited.body as { id: string }).id;
  const { cookie } = await t.signIn(phone);
  return { phone, membershipId, cookie, userId: (invited.body as { userId: string }).userId };
}

async function auditRows(organisationId: string, action: string) {
  return t.db.withTenant(organisationId, ({ tx }) =>
    tx.auditLog.findMany({ where: { action }, orderBy: { createdAt: "asc" } }),
  );
}

async function membershipRow(organisationId: string, membershipId: string) {
  return t.db.withTenant(organisationId, ({ tx }) =>
    tx.membership.findUnique({ where: { id: membershipId } }),
  );
}

describe("permission guard", () => {
  it("refuses a route that declares no permission, even for an owner", async () => {
    const { cookie } = await ownedClinic();
    const res = await t.get("/api/test/undecorated", cookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden");
  });

  it("refuses a permission route until an organisation is selected", async () => {
    const phone = randomPhone();
    await createClinic(t.db, phone, "Clinic A");
    await createClinic(t.db, phone, "Clinic B");
    const { cookie } = await t.signIn(phone);
    const res = await t.get("/api/memberships", cookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("org_not_selected");
  });

  it("refuses a permission route without a session", async () => {
    const res = await t.get("/api/memberships");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("unauthenticated");
  });
});

describe("listing members", () => {
  it("lists the clinic's members with phones and audits one row naming every returned id", async () => {
    const { cookie, clinic, phone, organisationId } = await ownedClinic();
    const desk = await member(cookie, ["front_desk"]);

    const res = await t.get("/api/memberships", cookie);
    expect(res.status).toBe(200);
    const list = membershipListSchema.parse(res.body);
    const byId = new Map(list.memberships.map((m) => [m.id, m]));
    expect([...byId.keys()].sort()).toEqual([clinic.ownerMembershipId, desk.membershipId].sort());
    expect(byId.get(clinic.ownerMembershipId)).toMatchObject({
      phone,
      roles: ["owner"],
      status: "active",
      name: null,
      organisationId,
    });
    expect(byId.get(desk.membershipId)).toMatchObject({ phone: desk.phone, roles: ["front_desk"] });

    const rows = await auditRows(organisationId, "membership.list");
    expect(rows).toHaveLength(1);
    expect([...(rows[0]?.entityIds ?? [])].sort()).toEqual([...byId.keys()].sort());
    expect(rows[0]).toMatchObject({ actorType: "user", actorId: clinic.ownerUserId });
  });

  it("is refused to front desk and doctors", async () => {
    const { cookie } = await ownedClinic();
    const desk = await member(cookie, ["front_desk"]);
    const doctor = await member(cookie, ["doctor"]);
    for (const who of [desk, doctor]) {
      const res = await t.get("/api/memberships", who.cookie);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("forbidden");
    }
  });
});

describe("inviting", () => {
  it("refuses front desk with 403; an owner gets 201 and an audit row", async () => {
    const { cookie, organisationId, clinic } = await ownedClinic();
    const desk = await member(cookie, ["front_desk"]);

    const refused = await invite(desk.cookie, randomPhone(), ["doctor"]);
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("forbidden");

    const phone = randomPhone();
    const res = await invite(cookie, phone, ["doctor", "owner"]);
    expect(res.status).toBe(201);
    const created = membershipSchema.parse(res.body);
    expect(created).toMatchObject({ phone, roles: ["doctor", "owner"], status: "active" });

    const rows = await auditRows(organisationId, "membership.invite");
    expect(rows.map((r) => r.entityIds)).toContainEqual([created.id]);
    expect(rows.find((r) => r.entityIds.includes(created.id))).toMatchObject({
      actorType: "user",
      actorId: clinic.ownerUserId,
      entityType: "membership",
    });
    expect(t.logs.join("\n")).not.toContain(phone.slice(3));
  });

  it("returns 409 for a phone that is already an active member", async () => {
    const { cookie, phone } = await ownedClinic();
    const desk = await member(cookie, ["front_desk"]);
    for (const existing of [desk.phone, phone]) {
      const res = await invite(cookie, existing, ["doctor"]);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("conflict");
      expect(JSON.stringify(res.body)).not.toContain(existing.slice(3));
    }
  });

  it("reactivates a deactivated member with the roles given", async () => {
    const { cookie, organisationId } = await ownedClinic();
    const desk = await member(cookie, ["front_desk"]);
    expect((await deactivate(cookie, desk.membershipId)).status).toBe(200);

    const res = await invite(cookie, desk.phone, ["doctor"]);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: desk.membershipId, roles: ["doctor"], status: "active" });
    const row = await membershipRow(organisationId, desk.membershipId);
    expect(row).toMatchObject({ status: "active", deactivatedAt: null, roles: ["doctor"] });
    const rows = await auditRows(organisationId, "membership.reactivated");
    expect(rows.map((r) => r.entityIds)).toContainEqual([desk.membershipId]);
  });

  it("links a phone that belongs to another clinic to the same user", async () => {
    const other = await ownedClinic("Clinic elsewhere");
    const { cookie, organisationId } = await ownedClinic("Clinic here");

    const res = await invite(cookie, other.phone, ["doctor"]);
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(other.clinic.ownerUserId);
    expect(res.body.organisationId).toBe(organisationId);

    const elsewhere = await membershipRow(other.organisationId, other.clinic.ownerMembershipId);
    expect(elsewhere).toMatchObject({ status: "active", roles: ["owner"] });
  });

  it("rejects an invalid phone without echoing it", async () => {
    const { cookie } = await ownedClinic();
    const res = await invite(cookie, "12345", ["doctor"]);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("validation_failed");
    expect(JSON.stringify(res.body)).not.toContain("12345");
  });
});

describe("changing roles", () => {
  it("changes roles and audits it", async () => {
    const { cookie, organisationId } = await ownedClinic();
    const desk = await member(cookie, ["front_desk"]);
    const res = await changeRoles(cookie, desk.membershipId, ["doctor", "front_desk"]);
    expect(res.status).toBe(200);
    expect(membershipSchema.parse(res.body).roles).toEqual(["doctor", "front_desk"]);
    const rows = await auditRows(organisationId, "membership.roles_changed");
    expect(rows.map((r) => r.entityIds)).toContainEqual([desk.membershipId]);
  });

  it("blocks the very next owner-only request after a downgrade from owner to front desk", async () => {
    const { cookie } = await ownedClinic();
    const second = await member(cookie, ["owner"]);
    expect((await t.get("/api/memberships", second.cookie)).status).toBe(200);

    expect((await changeRoles(cookie, second.membershipId, ["front_desk"])).status).toBe(200);

    const res = await t.get("/api/memberships", second.cookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden");
    const who = await t.get("/api/test/whoami", second.cookie);
    expect(who.body.roles).toEqual(["front_desk"]);
  });

  it("refuses the last active owner removing their own owner role", async () => {
    const { cookie, clinic, organisationId } = await ownedClinic();
    const res = await changeRoles(cookie, clinic.ownerMembershipId, ["doctor"]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("last_owner");
    const row = await membershipRow(organisationId, clinic.ownerMembershipId);
    expect(row?.roles).toEqual(["owner"]);
    expect(await auditRows(organisationId, "membership.roles_changed")).toHaveLength(0);
  });

  it("does not count a deactivated owner as the remaining owner", async () => {
    const { cookie, clinic } = await ownedClinic();
    const second = await member(cookie, ["owner"]);
    expect((await deactivate(cookie, second.membershipId)).status).toBe(200);
    const res = await changeRoles(cookie, clinic.ownerMembershipId, ["doctor"]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("last_owner");
  });

  it("lets an owner step down while another active owner remains", async () => {
    const { cookie, clinic } = await ownedClinic();
    await member(cookie, ["owner"]);
    const res = await changeRoles(cookie, clinic.ownerMembershipId, ["doctor"]);
    expect(res.status).toBe(200);
    expect((await t.get("/api/memberships", cookie)).status).toBe(403);
  });

  it("returns 404 for a membership of another clinic and changes nothing", async () => {
    const a = await ownedClinic("Clinic A");
    const b = await ownedClinic("Clinic B");
    const target = b.clinic.ownerMembershipId;

    const patched = await changeRoles(a.cookie, target, ["front_desk"]);
    expect(patched.status).toBe(404);
    expect(patched.body.code).toBe("not_found");
    for (const res of [await deactivate(a.cookie, target), await reactivate(a.cookie, target)]) {
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("not_found");
    }

    const row = await membershipRow(b.organisationId, target);
    expect(row).toMatchObject({ roles: ["owner"], status: "active", deactivatedAt: null });
    expect(await auditRows(a.organisationId, "membership.roles_changed")).toHaveLength(0);
    expect(await auditRows(b.organisationId, "membership.roles_changed")).toHaveLength(0);
  });

  it("rejects an empty or repeated role list", async () => {
    const { cookie, clinic } = await ownedClinic();
    for (const roles of [[], ["doctor", "doctor"]] as Role[][]) {
      const res = await changeRoles(cookie, clinic.ownerMembershipId, roles);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("validation_failed");
    }
  });
});

describe("deactivating and reactivating", () => {
  it("signs a deactivated member out: the next request and refresh fail, and it is audited", async () => {
    const { cookie, organisationId, clinic } = await ownedClinic();
    const desk = await member(cookie, ["front_desk"]);
    expect((await t.get("/api/test/whoami", desk.cookie)).status).toBe(200);

    const res = await deactivate(cookie, desk.membershipId);
    expect(res.status).toBe(200);
    expect(membershipSchema.parse(res.body).status).toBe("deactivated");
    const row = await membershipRow(organisationId, desk.membershipId);
    expect(row?.status).toBe("deactivated");
    expect(row?.deactivatedAt).toBeInstanceOf(Date);

    const next = await t.get("/api/test/whoami", desk.cookie);
    expect(next.status).toBe(401);
    expect(next.body.code).toBe("session_revoked");
    const refreshed = await t.post("/api/auth/refresh", randomIp(), undefined, desk.cookie);
    expect(refreshed.status).toBe(401);

    const rows = await auditRows(organisationId, "membership.deactivated");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: clinic.ownerUserId,
      entityType: "membership",
      entityIds: [desk.membershipId],
    });
  });

  it("refuses the last active owner deactivating themselves", async () => {
    const { cookie, clinic, organisationId } = await ownedClinic();
    const res = await deactivate(cookie, clinic.ownerMembershipId);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("last_owner");
    expect((await membershipRow(organisationId, clinic.ownerMembershipId))?.status).toBe("active");
    expect((await t.get("/api/memberships", cookie)).status).toBe(200);
  });

  it("keeps a member's access to another clinic but stops them switching to this one", async () => {
    const a = await ownedClinic("Clinic A");
    const b = await ownedClinic("Clinic B");
    const phone = randomPhone();
    const inA = await invite(a.cookie, phone, ["doctor"]);
    expect((await invite(b.cookie, phone, ["doctor"])).status).toBe(201);
    const { cookie } = await t.signIn(phone);
    const selected = await t.post(
      "/api/auth/org/select",
      randomIp(),
      { organisationId: b.organisationId },
      cookie,
    );
    expect(selected.status).toBe(200);

    expect((await deactivate(a.cookie, (inA.body as { id: string }).id)).status).toBe(200);

    const who = await t.get("/api/test/whoami", cookie);
    expect(who.status).toBe(200);
    expect(who.body.organisationId).toBe(b.organisationId);
    const toA = await t.post(
      "/api/auth/org/select",
      randomIp(),
      { organisationId: a.organisationId },
      cookie,
    );
    expect(toA.status).toBe(403);
    const session = await t.get("/api/auth/session", cookie);
    expect(
      (session.body.organisations as Array<{ organisationId: string }>).map(
        (o) => o.organisationId,
      ),
    ).toEqual([b.organisationId]);
  });

  it("reactivates a member, who can then sign in again, and audits it", async () => {
    const { cookie, organisationId } = await ownedClinic();
    const desk = await member(cookie, ["front_desk"]);
    expect((await deactivate(cookie, desk.membershipId)).status).toBe(200);

    const res = await reactivate(cookie, desk.membershipId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "active", roles: ["front_desk"] });
    expect((await membershipRow(organisationId, desk.membershipId))?.deactivatedAt).toBeNull();
    const rows = await auditRows(organisationId, "membership.reactivated");
    expect(rows.map((r) => r.entityIds)).toContainEqual([desk.membershipId]);

    t.clock.advance(31 * SECOND); // past the resend gap since the member's first sign-in
    const { cookie: again } = await t.signIn(desk.phone);
    expect((await t.get("/api/test/whoami", again)).body.organisationId).toBe(organisationId);
  });

  it("refuses front desk deactivating anyone", async () => {
    const { cookie, clinic } = await ownedClinic();
    const desk = await member(cookie, ["front_desk"]);
    const res = await deactivate(desk.cookie, clinic.ownerMembershipId);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden");
  });
});
