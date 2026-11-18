import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/index.js";
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

describe("withTenant", () => {
  it("scopes concurrent transactions on one pool to their own organisation", async () => {
    const [seenByA, seenByB] = await Promise.all([
      db.withTenant(a.orgId, async ({ tx }) => {
        await new Promise((r) => setTimeout(r, 30));
        return (await tx.location.findMany()).map((l) => l.organisationId);
      }),
      db.withTenant(b.orgId, async ({ tx }) =>
        (await tx.location.findMany()).map((l) => l.organisationId),
      ),
    ]);
    expect(seenByA).toEqual([a.orgId]);
    expect(seenByB).toEqual([b.orgId]);
  });

  it("rolls back writes, skips after-commit callbacks and leaves no context when fn throws", async () => {
    const name = `Rollback ${randomUUID().slice(0, 8)}`;
    let afterCommitRan = false;
    await expect(
      db.withTenant(a.orgId, async ({ tx, afterCommit }) => {
        await tx.location.create({ data: { organisationId: a.orgId, name } });
        afterCommit(() => {
          afterCommitRan = true;
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(afterCommitRan).toBe(false);
    const found = await db.withTenant(a.orgId, ({ tx }) =>
      tx.location.findFirst({ where: { name } }),
    );
    expect(found).toBeNull();
    // A raw query on the same pool outside any transaction sees no tenant rows.
    const { rowCount } = await pool.query("SELECT 1 FROM location");
    expect(rowCount).toBe(0);
  });

  it("runs after-commit callbacks only once the transaction has committed", async () => {
    const name = `Commit ${randomUUID().slice(0, 8)}`;
    const visibleAtCallback: boolean[] = [];
    await db.withTenant(a.orgId, async ({ tx, afterCommit }) => {
      await tx.location.create({ data: { organisationId: a.orgId, name } });
      afterCommit(async () => {
        const row = await db.withTenant(a.orgId, ({ tx: t }) =>
          t.location.findFirst({ where: { name } }),
        );
        visibleAtCallback.push(row !== null);
      });
    });
    expect(visibleAtCallback).toEqual([true]);
  });

  it("throws when nested with a different organisation", async () => {
    await expect(
      db.withTenant(a.orgId, () => db.withTenant(b.orgId, async () => "nested")),
    ).rejects.toThrow(/different organisation/);
  });
});

describe("withSystem", () => {
  it("reads global tables and the membership lookup", async () => {
    const result = await db.withSystem("auth", async (sys) => ({
      user: await sys.user.findUnique({ where: { id: a.userId } }),
      memberships: await sys.userMemberships(a.userId),
    }));
    expect(result.user?.id).toBe(a.userId);
    expect(result.memberships.map((m) => m.organisationId)).toEqual([a.orgId]);
  });

  it("refuses to touch tenant models", async () => {
    await expect(
      db.withSystem("auth", async (sys) => {
        const unsafe = sys as unknown as { membership: { findMany: () => Promise<unknown> } };
        return unsafe.membership.findMany();
      }),
    ).rejects.toThrow(/not available in a system context/);
  });
});
