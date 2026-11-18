import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDb,
  createOrganisation,
  parseCreateOrganisationArgs,
  type Db,
} from "../src/index.js";
import { appPool } from "./helpers/pg.js";

const OPERATOR_ID = "00000000-0000-4000-8000-0000000000aa";
let pool: pg.Pool;
let db: Db;

const randomPhone = () => `98${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

beforeAll(() => {
  pool = appPool();
  db = createDb({ connectionString: process.env["DATABASE_URL"] ?? "" });
});

afterAll(async () => {
  await db.disconnect();
  await pool.end();
});

async function counts(orgId: string) {
  return db.withTenant(orgId, async ({ tx }) => ({
    organisations: await tx.organisation.count(),
    locations: await tx.location.count(),
    memberships: await tx.membership.findMany({ select: { roles: true, userId: true } }),
    audits: await tx.auditLog.findMany({
      select: { actorType: true, actorId: true, action: true },
    }),
  }));
}

describe("createOrganisation", () => {
  it("creates one organisation, location and owner membership, with one operator audit row", async () => {
    const result = await createOrganisation(db, {
      name: "Sunrise Test Clinic",
      locationName: "Main branch",
      ownerPhone: randomPhone(),
      operatorId: OPERATOR_ID,
    });
    const c = await counts(result.organisationId);
    expect(c.organisations).toBe(1);
    expect(c.locations).toBe(1);
    expect(c.memberships).toEqual([{ roles: ["owner"], userId: result.ownerUserId }]);
    expect(c.audits).toEqual([
      { actorType: "operator", actorId: OPERATOR_ID, action: "organisation.create" },
    ]);
  });

  it("links an existing owner phone to the existing user instead of duplicating it", async () => {
    const phone = randomPhone();
    const first = await createOrganisation(db, {
      name: "Clinic One",
      locationName: "Main",
      ownerPhone: phone,
      operatorId: OPERATOR_ID,
    });
    const second = await createOrganisation(db, {
      name: "Clinic Two",
      locationName: "Main",
      ownerPhone: `+91 ${phone}`,
      operatorId: OPERATOR_ID,
    });
    expect(second.ownerUserId).toBe(first.ownerUserId);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM app_user WHERE phone = $1", [
      `+91${phone}`,
    ]);
    expect(rows[0]).toEqual({ n: 1 });
  });

  it("creates nothing new and writes no second audit row when re-run with the same id", async () => {
    const organisationId = randomUUID();
    const input = {
      organisationId,
      name: "Idempotent Clinic",
      locationName: "Main",
      ownerPhone: randomPhone(),
      operatorId: OPERATOR_ID,
    };
    await createOrganisation(db, input);
    await createOrganisation(db, input);
    const c = await counts(organisationId);
    expect(c.locations).toBe(1);
    expect(c.memberships).toHaveLength(1);
    expect(c.audits).toHaveLength(1);
  });
});

describe("create-organisation command arguments", () => {
  it("rejects missing arguments or a missing operator id", () => {
    expect(() => parseCreateOrganisationArgs(["--name", "X"], { OPERATOR_ID })).toThrow(
      /--location/,
    );
    expect(() =>
      parseCreateOrganisationArgs(
        ["--name", "X", "--location", "Main", "--owner-phone", "9876543210"],
        {},
      ),
    ).toThrow(/OPERATOR_ID/);
    expect(() =>
      parseCreateOrganisationArgs(["--name", "X", "--location", "Main", "--owner-phone", "12345"], {
        OPERATOR_ID,
      }),
    ).toThrow(/phone/);
  });

  it("accepts a complete set of arguments", () => {
    expect(
      parseCreateOrganisationArgs(
        ["--name", "X", "--location", "Main", "--owner-phone", "9876543210"],
        { OPERATOR_ID },
      ),
    ).toMatchObject({
      name: "X",
      locationName: "Main",
      ownerPhone: "+919876543210",
      operatorId: OPERATOR_ID,
    });
  });
});
