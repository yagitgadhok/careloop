/**
 * pnpm ops:create-org -- --name "Clinic name" --location "Main branch" --owner-phone 98XXXXXXXX [--org-id <uuid>]
 *
 * Creates a clinic, its first location and its owner. Prints ids only.
 */
import { createOrganisation, parseCreateOrganisationArgs } from "../src/index.js";
import { runCommand } from "./run-command.js";

await runCommand("ops:create-org", async (db) => {
  const input = parseCreateOrganisationArgs(process.argv.slice(2), process.env);
  const result = await createOrganisation(db, input);
  return [
    result.created ? "Organisation created." : "Organisation already existed; nothing changed.",
    `organisation ${result.organisationId}`,
    `location     ${result.locationId}`,
    `owner user   ${result.ownerUserId}`,
  ].join("\n");
});
