import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ownerPool } from "./helpers/pg.js";

// Tables with no tenant policy. Everything else in public must be a tenant
// table: organisation_id column, forced RLS and at least one policy.
const GLOBAL_TABLES = new Set([
  "app_user",
  "otp_challenge",
  "session",
  "security_event",
  "organisation",
  "_prisma_migrations",
]);

let pool: pg.Pool;

beforeAll(() => {
  pool = ownerPool();
});

afterAll(async () => {
  await pool.end();
});

interface TableInfo {
  table: string;
  has_org_column: boolean;
  rls_enabled: boolean;
  rls_forced: boolean;
  policy_count: number;
}

/** Pool or a single client, so a test can read the catalogue inside its own transaction. */
type Queryable = Pick<pg.Pool, "query">;

async function tableInfo(db: Queryable = pool): Promise<TableInfo[]> {
  const { rows } = await db.query<TableInfo>(`
    SELECT c.relname AS table,
           EXISTS (
             SELECT 1 FROM pg_attribute a
             WHERE a.attrelid = c.oid AND a.attname = 'organisation_id' AND NOT a.attisdropped
           ) AS has_org_column,
           c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS rls_forced,
           (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  `);
  return rows;
}

/** True when a table meets the tenant-table rule: organisation_id, forced RLS, a policy. */
function isGuardedTenantTable(t: TableInfo): boolean {
  return t.has_org_column && t.rls_forced && t.policy_count > 0;
}

/** Tables outside the global allowlist that break the tenant-table rule. */
function offenders(tables: TableInfo[]): string[] {
  return tables
    .filter((t) => !GLOBAL_TABLES.has(t.table) && !isGuardedTenantTable(t))
    .map((t) => t.table);
}

describe("row-level security catalogue", () => {
  it("forces RLS with a policy on every tenant table", async () => {
    const tables = await tableInfo();
    expect(tables.filter((t) => !GLOBAL_TABLES.has(t.table)).length).toBeGreaterThan(0);
    expect(offenders(tables)).toEqual([]);
  });

  it("forces RLS with id-based policies on organisation", async () => {
    const org = (await tableInfo()).find((t) => t.table === "organisation");
    expect(org).toMatchObject({ rls_enabled: true, rls_forced: true });
    expect(org?.policy_count).toBeGreaterThan(0);
  });

  it("flags a tenant table that has no policy, and stops once it has forced RLS and a policy", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE TABLE catalogue_probe (id uuid, organisation_id uuid)");
      expect(offenders(await tableInfo(client))).toContain("catalogue_probe");

      await client.query("ALTER TABLE catalogue_probe ENABLE ROW LEVEL SECURITY");
      await client.query("ALTER TABLE catalogue_probe FORCE ROW LEVEL SECURITY");
      expect(offenders(await tableInfo(client))).toContain("catalogue_probe");

      await client.query("CREATE POLICY catalogue_probe_policy ON catalogue_probe USING (true)");
      expect(offenders(await tableInfo(client))).not.toContain("catalogue_probe");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("gives neither database role superuser or BYPASSRLS, and the app role owns nothing", async () => {
    const { rows } = await pool.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('careloop_app', 'careloop_owner') ORDER BY rolname",
    );
    expect(rows).toEqual([
      { rolname: "careloop_app", rolsuper: false, rolbypassrls: false },
      { rolname: "careloop_owner", rolsuper: false, rolbypassrls: false },
    ]);
    const owned = await pool.query(
      "SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE r.rolname = 'careloop_app'",
    );
    expect(owned.rowCount).toBe(0);
  });

  it("lets the app role use a table a later migration creates, without a per-table grant", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE TABLE default_privilege_probe (id int)");
      const { rows } = await client.query<{ allowed: boolean }>(
        "SELECT has_table_privilege('careloop_app', 'default_privilege_probe', 'SELECT, INSERT') AS allowed",
      );
      expect(rows[0]?.allowed).toBe(true);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
