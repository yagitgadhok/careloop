import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appPool, asOrg, createOrgFixture, type OrgFixture } from "./helpers/pg.js";

let pool: pg.Pool;
let org: OrgFixture;
let auditId: string;
let eventId: string;

beforeAll(async () => {
  pool = appPool();
  org = await createOrgFixture(pool, "audit");
  auditId = randomUUID();
  eventId = randomUUID();
  await asOrg(
    pool,
    org.orgId,
    (client) =>
      client.query(
        "INSERT INTO audit_log (id, organisation_id, actor_type, action, entity_type, entity_ids) VALUES ($1, $2, 'system', 'test.write', 'location', ARRAY[$3]::uuid[])",
        [auditId, org.orgId, org.locationId],
      ),
    { commit: true },
  );
  await pool.query("INSERT INTO security_event (id, type) VALUES ($1, 'test.event')", [eventId]);
});

afterAll(async () => {
  await pool.end();
});

describe("append-only tables", () => {
  for (const [table, idRef, withOrg] of [
    ["audit_log", () => auditId, true],
    ["security_event", () => eventId, false],
  ] as const) {
    it(`refuses UPDATE, DELETE and TRUNCATE on ${table} for the app role`, async () => {
      const orgId = withOrg ? org.orgId : null;
      await expect(
        asOrg(pool, orgId, (c) =>
          c.query(`UPDATE ${table} SET action = 'x' WHERE id = $1`, [idRef()]),
        ),
      ).rejects.toThrow();
      await expect(
        asOrg(pool, orgId, (c) => c.query(`DELETE FROM ${table} WHERE id = $1`, [idRef()])),
      ).rejects.toThrow(/permission denied/);
      await expect(asOrg(pool, orgId, (c) => c.query(`TRUNCATE ${table}`))).rejects.toThrow(
        /permission denied/,
      );
    });
  }
});
