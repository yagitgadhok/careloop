/**
 * Creates the two database roles CareLoop uses, idempotently.
 *
 * - careloop_owner owns the schema and runs migrations.
 * - careloop_app is what the application connects as. It owns nothing, so
 *   forced row-level security always applies to it.
 *
 * Neither role is a superuser or has BYPASSRLS in any environment, so local
 * and CI behave like a managed Postgres. The owner gets CREATEDB (for Prisma's
 * shadow database) only in local and test environments.
 *
 * Runs with an admin connection (DATABASE_ADMIN_URL) before migrations.
 */
import pg from "pg";
import { isLocalOrTest, loadRootEnv, requireEnv } from "./env.js";

const OWNER = "careloop_owner";
const APP = "careloop_app";

async function ensureRole(client: pg.Client, role: string, password: string, createDb: boolean) {
  const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
  const verb = exists.rowCount ? "ALTER" : "CREATE";
  const options = [
    "LOGIN",
    "NOSUPERUSER",
    "NOBYPASSRLS",
    "NOCREATEROLE",
    createDb ? "CREATEDB" : "NOCREATEDB",
  ].join(" ");
  await client.query(
    `${verb} ROLE ${role} WITH ${options} PASSWORD ${client.escapeLiteral(password)}`,
  );
}

async function main() {
  loadRootEnv();
  const adminUrl = requireEnv("DATABASE_ADMIN_URL");
  const ownerPassword = requireEnv("DATABASE_OWNER_PASSWORD");
  const appPassword = requireEnv("DATABASE_APP_PASSWORD");
  const localOrTest = isLocalOrTest();

  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await ensureRole(client, OWNER, ownerPassword, localOrTest);
    await ensureRole(client, APP, appPassword, false);

    const { rows } = await client.query<{ db: string }>("SELECT current_database() AS db");
    const db = rows[0]?.db;
    if (!db) throw new Error("Could not read the current database name");

    await client.query(
      `GRANT CONNECT, CREATE ON DATABASE ${client.escapeIdentifier(db)} TO ${OWNER}`,
    );
    await client.query(`GRANT CONNECT ON DATABASE ${client.escapeIdentifier(db)} TO ${APP}`);
    await client.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${OWNER}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${APP}`);

    if (localOrTest) {
      const shadow = `${db}_shadow`;
      const shadowExists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
        shadow,
      ]);
      if (!shadowExists.rowCount) {
        await client.query(`CREATE DATABASE ${client.escapeIdentifier(shadow)} OWNER ${OWNER}`);
      }
    }
  } finally {
    await client.end();
  }
  process.stdout.write("Database roles are ready.\n");
}

main().catch((error: unknown) => {
  process.stderr.write(
    `db:bootstrap failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exit(1);
});
