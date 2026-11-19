import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appPool, asOrg, createOrgFixture, type OrgFixture } from "./helpers/pg.js";

let pool: pg.Pool;
let org: OrgFixture;

beforeAll(async () => {
  pool = appPool();
  org = await createOrgFixture(pool, "constraints");
});

afterAll(async () => {
  await pool.end();
});

/** A second made-up user, so a new membership does not collide with the owner's. */
async function anotherUser(): Promise<string> {
  const id = randomUUID();
  const phone = `+9190001${Math.floor(10000 + Math.random() * 89999)}`;
  await pool.query("INSERT INTO app_user (id, phone, updated_at) VALUES ($1, $2, now())", [
    id,
    phone,
  ]);
  return id;
}

function insertMembership(userId: string, roles: string | null) {
  return asOrg(pool, org.orgId, (client) =>
    client.query(
      "INSERT INTO membership (id, organisation_id, user_id, roles, updated_at) VALUES ($1, $2, $3, $4::role[], now())",
      [randomUUID(), org.orgId, userId, roles],
    ),
  );
}

describe("membership roles", () => {
  it("refuses a membership with NULL roles", async () => {
    const userId = await anotherUser();
    await expect(insertMembership(userId, null)).rejects.toMatchObject({
      code: "23514",
      constraint: "membership_roles_not_empty",
    });
  });

  it("refuses a membership with no roles", async () => {
    const userId = await anotherUser();
    await expect(insertMembership(userId, "{}")).rejects.toMatchObject({
      code: "23514",
      constraint: "membership_roles_not_empty",
    });
  });

  it("refuses setting an existing membership's roles to NULL", async () => {
    await expect(
      asOrg(pool, org.orgId, (client) =>
        client.query("UPDATE membership SET roles = NULL WHERE id = $1", [org.membershipId]),
      ),
    ).rejects.toMatchObject({ code: "23514", constraint: "membership_roles_not_empty" });
  });

  it("accepts a membership with one role", async () => {
    const userId = await anotherUser();
    await expect(insertMembership(userId, "{doctor}")).resolves.toMatchObject({ rowCount: 1 });
  });
});
