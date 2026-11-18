import { createDb, type Db } from "../src/index.js";
import { loadRootEnv, requireEnv } from "./env.js";

/**
 * Runs an operator command with a database handle and clean exit codes.
 * Errors print their message only (messages here never carry phone digits).
 */
export async function runCommand(name: string, fn: (db: Db) => Promise<string>): Promise<void> {
  loadRootEnv();
  let db: Db | undefined;
  try {
    db = createDb({ connectionString: requireEnv("DATABASE_URL") });
    const output = await fn(db);
    process.stdout.write(`${output}\n`);
  } catch (error) {
    process.stderr.write(
      `${name} failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  } finally {
    await db?.disconnect();
  }
}
