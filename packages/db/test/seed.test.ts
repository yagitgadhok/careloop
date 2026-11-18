import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertSeedAllowed, runSeed, SEED } from "../seed/seed.js";
import { createDb, type Db } from "../src/index.js";
import { ownerPool } from "./helpers/pg.js";

let db: Db;
let owner: pg.Pool;

beforeAll(() => {
  db = createDb({ connectionString: process.env["DATABASE_URL"] ?? "" });
  owner = ownerPool();
});

afterAll(async () => {
  await db.disconnect();
  await owner.end();
});

async function seededCounts() {
  const orgIds = [SEED.sunrise.id, SEED.lotus.id];
  const perOrg = await Promise.all(
    orgIds.map((id) =>
      db.withTenant(id, async ({ tx }) => ({
        locations: await tx.location.count(),
        departments: await tx.department.count(),
        memberships: await tx.membership.count(),
        audits: await tx.auditLog.count(),
      })),
    ),
  );
  return perOrg;
}

describe("seed", () => {
  it("is safe to re-run: same rows, and no new audit rows the second time", async () => {
    await runSeed(db);
    const first = await seededCounts();
    await runSeed(db);
    const second = await seededCounts();
    expect(second).toEqual(first);
    expect(first[0]).toMatchObject({ locations: 1, departments: 1, memberships: 3 });
    expect(first[1]).toMatchObject({ locations: 2, departments: 3, memberships: 4 });
  });

  it("gives the shared doctor a membership in both clinics", async () => {
    await runSeed(db);
    const memberships = await db.withSystem("seed", async (sys) => {
      const user = await sys.user.findUnique({ where: { phone: SEED.sharedDoctorPhone } });
      return user ? sys.userMemberships(user.id) : [];
    });
    expect(memberships.map((m) => m.organisationId).sort()).toEqual(
      [SEED.sunrise.id, SEED.lotus.id].sort(),
    );
  });

  it("refuses to run outside local and test environments", () => {
    expect(() => assertSeedAllowed({ APP_ENV: "staging" })).toThrow(/local or test/);
    expect(() => assertSeedAllowed({ APP_ENV: "production" })).toThrow(/local or test/);
    expect(() => assertSeedAllowed({ APP_ENV: "local" })).not.toThrow();
  });
});
