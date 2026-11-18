import { randomUUID } from "node:crypto";
import pg from "pg";

/** Connects as the application role, which row-level security applies to. */
export function appPool(): pg.Pool {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set for tests");
  return new pg.Pool({ connectionString: url, max: 4 });
}

/** Connects as the migration owner role. */
export function ownerPool(): pg.Pool {
  const url = process.env["DATABASE_OWNER_URL"];
  if (!url) throw new Error("DATABASE_OWNER_URL is not set for tests");
  return new pg.Pool({ connectionString: url, max: 2 });
}

/** Runs fn in one transaction with the tenant context set, then rolls back or commits. */
export async function asOrg<T>(
  pool: pg.Pool,
  orgId: string | null,
  fn: (client: pg.PoolClient) => Promise<T>,
  { commit = false }: { commit?: boolean } = {},
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (orgId !== null) {
      await client.query("SELECT set_config('app.organisation_id', $1, true)", [orgId]);
    }
    const result = await fn(client);
    await client.query(commit ? "COMMIT" : "ROLLBACK");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface OrgFixture {
  orgId: string;
  locationId: string;
  userId: string;
  membershipId: string;
}

/** Creates an organisation, a location, a user and an owner membership, as the app role. */
export async function createOrgFixture(pool: pg.Pool, label: string): Promise<OrgFixture> {
  const orgId = randomUUID();
  const locationId = randomUUID();
  const membershipId = randomUUID();
  const userId = randomUUID();
  const phone = `+9190000${Math.floor(10000 + Math.random() * 89999)}`;

  await pool.query("INSERT INTO app_user (id, phone, updated_at) VALUES ($1, $2, now())", [
    userId,
    phone,
  ]);
  await asOrg(
    pool,
    orgId,
    async (client) => {
      await client.query("INSERT INTO organisation (id, name, updated_at) VALUES ($1, $2, now())", [
        orgId,
        `Test clinic ${label} ${orgId.slice(0, 8)}`,
      ]);
      await client.query(
        "INSERT INTO location (id, organisation_id, name, updated_at) VALUES ($1, $2, 'Main', now())",
        [locationId, orgId],
      );
      await client.query(
        "INSERT INTO membership (id, organisation_id, user_id, roles, updated_at) VALUES ($1, $2, $3, '{owner}', now())",
        [membershipId, orgId, userId],
      );
    },
    { commit: true },
  );
  return { orgId, locationId, userId, membershipId };
}
