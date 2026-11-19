import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { audit, createDb, securityEvent, type Db } from "../src/index.js";
import { appPool, createOrgFixture, type OrgFixture } from "./helpers/pg.js";

let pool: pg.Pool;
let db: Db;
let a: OrgFixture;
let b: OrgFixture;

beforeAll(async () => {
  pool = appPool();
  a = await createOrgFixture(pool, "A");
  b = await createOrgFixture(pool, "B");
  db = createDb({ connectionString: process.env["DATABASE_URL"] ?? "" });
});

afterAll(async () => {
  await db.disconnect();
  await pool.end();
});

const auditRowsFor = (orgId: string, entityId: string) =>
  db.withTenant(orgId, ({ tx }) =>
    tx.auditLog.findMany({ where: { entityIds: { has: entityId } } }),
  );

describe("audit", () => {
  it("commits a write and its audit row together", async () => {
    const location = await db.withTenant(a.orgId, async (ctx) => {
      const created = await ctx.tx.location.create({
        data: { organisationId: a.orgId, name: `Audited ${randomUUID().slice(0, 8)}` },
      });
      await audit(ctx, {
        actorType: "user",
        actorId: a.userId,
        action: "location.create",
        entityType: "location",
        entityIds: [created.id],
      });
      return created;
    });
    const rows = await auditRowsFor(a.orgId, location.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organisationId: a.orgId,
      actorType: "user",
      actorId: a.userId,
      action: "location.create",
    });
  });

  it("rolls back both the write and the audit row when the work fails afterwards", async () => {
    const id = randomUUID();
    await expect(
      db.withTenant(a.orgId, async (ctx) => {
        await ctx.tx.location.create({ data: { id, organisationId: a.orgId, name: `Gone ${id}` } });
        await audit(ctx, {
          actorType: "user",
          actorId: a.userId,
          action: "location.create",
          entityType: "location",
          entityIds: [id],
        });
        throw new Error("later failure");
      }),
    ).rejects.toThrow("later failure");
    expect(await auditRowsFor(a.orgId, id)).toHaveLength(0);
  });

  it("fails the whole transaction when the audit insert fails", async () => {
    const id = randomUUID();
    await expect(
      db.withTenant(a.orgId, async (ctx) => {
        await ctx.tx.location.create({ data: { id, organisationId: a.orgId, name: `Fail ${id}` } });
        await audit(ctx, {
          actorType: "user",
          actorId: a.userId,
          action: "location.create",
          entityType: "location",
          entityIds: ["not-a-uuid"],
        });
      }),
    ).rejects.toThrow();
    const location = await db.withTenant(a.orgId, ({ tx }) =>
      tx.location.findUnique({ where: { id } }),
    );
    expect(location).toBeNull();
  });

  it("keeps an organisation's audit rows invisible to another organisation", async () => {
    const entityId = randomUUID();
    await db.withTenant(a.orgId, (ctx) =>
      audit(ctx, {
        actorType: "system",
        action: "probe",
        entityType: "probe",
        entityIds: [entityId],
      }),
    );
    expect(await auditRowsFor(a.orgId, entityId)).toHaveLength(1);
    expect(await auditRowsFor(b.orgId, entityId)).toHaveLength(0);
  });

  it("records a system actor with no user id", async () => {
    const entityId = randomUUID();
    await db.withTenant(a.orgId, (ctx) =>
      audit(ctx, {
        actorType: "system",
        action: "probe",
        entityType: "probe",
        entityIds: [entityId],
      }),
    );
    const [row] = await auditRowsFor(a.orgId, entityId);
    expect(row).toMatchObject({ actorType: "system", actorId: null });
  });

  it("records a list read as one row carrying every returned id", async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    await db.withTenant(a.orgId, (ctx) =>
      audit(ctx, {
        actorType: "user",
        actorId: a.userId,
        action: "membership.list",
        entityType: "membership",
        entityIds: ids,
      }),
    );
    const rows = await auditRowsFor(a.orgId, ids[1] ?? "");
    expect(rows).toHaveLength(1);
    expect([...(rows[0]?.entityIds ?? [])].sort()).toEqual([...ids].sort());
  });
});

describe("securityEvent", () => {
  it("records a pre-tenant event with a hashed phone only", async () => {
    const phoneHash = "hash-" + randomUUID();
    await db.withSystem("auth", (sys) =>
      securityEvent(sys, { type: "otp.requested", phoneHash, requestId: "req-1" }),
    );
    const { rows } = await pool.query(
      "SELECT type, phone_hash FROM security_event WHERE phone_hash = $1",
      [phoneHash],
    );
    expect(rows).toEqual([{ type: "otp.requested", phone_hash: phoneHash }]);
  });
});
