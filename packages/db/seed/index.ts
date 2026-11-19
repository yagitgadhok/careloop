/** pnpm db:seed — made-up demo clinics and staff (local and test only). */
import { runCommand } from "../scripts/run-command.js";
import { assertSeedAllowed, runSeed, SEED } from "./seed.js";

await runCommand("db:seed", async (db) => {
  assertSeedAllowed(process.env);
  await runSeed(db);
  return [
    "Seeded demo clinics:",
    `  ${SEED.sunrise.name}`,
    `  ${SEED.lotus.name}`,
    "Sign in locally with any 99999 000xx demo number; codes print to the API console.",
  ].join("\n");
});
