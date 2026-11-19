import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appPool, asOrg, createOrgFixture, type OrgFixture } from "./helpers/pg.js";

let pool: pg.Pool;
let a: OrgFixture;
let b: OrgFixture;

beforeAll(async () => {
  pool = appPool();
  a = await createOrgFixture(pool, "A");
  b = await createOrgFixture(pool, "B");
});

afterAll(async () => {
  await pool.end();
});

describe("tenant isolation as the application role", () => {
  it("organisation A sees only its own locations and memberships", async () => {
    const rows = await asOrg(pool, a.orgId, async (client) => {
      const locations = await client.query<{ organisation_id: string }>(
        "SELECT organisation_id FROM location",
      );
      const memberships = await client.query<{ organisation_id: string }>(
        "SELECT organisation_id FROM membership",
      );
      return [...locations.rows, ...memberships.rows];
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organisation_id === a.orgId)).toBe(true);
  });

  it("organisation B reads zero of organisation A's rows by id", async () => {
    const counts = await asOrg(pool, b.orgId, async (client) => {
      const location = await client.query("SELECT 1 FROM location WHERE id = $1", [a.locationId]);
      const membership = await client.query("SELECT 1 FROM membership WHERE id = $1", [
        a.membershipId,
      ]);
      const organisation = await client.query("SELECT 1 FROM organisation WHERE id = $1", [
        a.orgId,
      ]);
      return [location.rowCount, membership.rowCount, organisation.rowCount];
    });
    expect(counts).toEqual([0, 0, 0]);
  });

  it("returns no tenant rows and refuses inserts when no context is set", async () => {
    await asOrg(pool, null, async (client) => {
      const result = await client.query("SELECT 1 FROM location");
      expect(result.rowCount).toBe(0);
    });
    await expect(
      asOrg(pool, null, (client) =>
        client.query(
          "INSERT INTO location (id, organisation_id, name, updated_at) VALUES ($1, $2, 'X', now())",
          [randomUUID(), a.orgId],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("treats an empty context (a reused pooled connection) as no organisation", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.organisation_id', $1, true)", [a.orgId]);
      await client.query("COMMIT");
      // The setting now reads back as '' on this connection.
      await client.query("BEGIN");
      const result = await client.query("SELECT 1 FROM location");
      await client.query("COMMIT");
      expect(result.rowCount).toBe(0);
    } finally {
      client.release();
    }
  });

  it("refuses to move a row into another organisation", async () => {
    await expect(
      asOrg(pool, a.orgId, (client) =>
        client.query("UPDATE location SET organisation_id = $1 WHERE id = $2", [
          b.orgId,
          a.locationId,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("refuses a department that points at another organisation's location", async () => {
    await expect(
      asOrg(pool, a.orgId, (client) =>
        client.query(
          "INSERT INTO department (id, organisation_id, location_id, name, updated_at) VALUES ($1, $2, $3, 'GP', now())",
          [randomUUID(), a.orgId, b.locationId],
        ),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("refuses an organisation insert for an id other than the context", async () => {
    await expect(
      asOrg(pool, a.orgId, (client) =>
        client.query(
          "INSERT INTO organisation (id, name, updated_at) VALUES ($1, 'Rogue', now())",
          [randomUUID()],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("rejects memberships with no roles or duplicate roles", async () => {
    await expect(
      asOrg(pool, a.orgId, (client) =>
        client.query("UPDATE membership SET roles = '{}' WHERE id = $1", [a.membershipId]),
      ),
    ).rejects.toThrow(/membership_roles_not_empty/);
    await expect(
      asOrg(pool, a.orgId, (client) =>
        client.query("UPDATE membership SET roles = '{owner,owner}' WHERE id = $1", [
          a.membershipId,
        ]),
      ),
    ).rejects.toThrow(/membership_roles_distinct/);
  });
});
