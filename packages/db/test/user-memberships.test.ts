import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appPool, asOrg, createOrgFixture, type OrgFixture } from "./helpers/pg.js";

let pool: pg.Pool;
let a: OrgFixture;
let b: OrgFixture;
let sharedDoctorId: string;

beforeAll(async () => {
  pool = appPool();
  a = await createOrgFixture(pool, "A");
  b = await createOrgFixture(pool, "B");
  sharedDoctorId = randomUUID();
  await pool.query("INSERT INTO app_user (id, phone, updated_at) VALUES ($1, $2, now())", [
    sharedDoctorId,
    `+9191111${Math.floor(10000 + Math.random() * 89999)}`,
  ]);
  for (const org of [a, b]) {
    await asOrg(
      pool,
      org.orgId,
      (client) =>
        client.query(
          "INSERT INTO membership (id, organisation_id, user_id, roles, updated_at) VALUES ($1, $2, $3, '{doctor}', now())",
          [randomUUID(), org.orgId, sharedDoctorId],
        ),
      { commit: true },
    );
  }
});

afterAll(async () => {
  await pool.end();
});

describe("cross-organisation membership lookup", () => {
  it("returns a doctor's memberships in both clinics with names, outside any tenant context", async () => {
    const { rows } = await pool.query<{ organisation_id: string; organisation_name: string }>(
      "SELECT * FROM app.user_memberships($1)",
      [sharedDoctorId],
    );
    expect(rows.map((r) => r.organisation_id).sort()).toEqual([a.orgId, b.orgId].sort());
    expect(rows.every((r) => r.organisation_name.startsWith("Test clinic"))).toBe(true);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
      "organisation_id",
      "organisation_name",
      "organisation_status",
      "roles",
      "status",
    ]);
  });

  it("does not open membership or organisation tables to the app role directly", async () => {
    const { rowCount } = await pool.query("SELECT 1 FROM membership WHERE user_id = $1", [
      sharedDoctorId,
    ]);
    expect(rowCount).toBe(0);
  });
});
