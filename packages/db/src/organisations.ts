import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { toE164 } from "./phone.js";
import { audit } from "./audit.js";
import type { Db } from "./tenant.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateOrganisationInput {
  /** Fixed id (the seed passes one); generated when omitted. */
  organisationId?: string;
  name: string;
  locationName: string;
  ownerPhone: string;
  /** The CareLoop operator responsible, recorded as the audit actor. */
  operatorId: string;
}

export interface CreateOrganisationResult {
  organisationId: string;
  locationId: string;
  ownerUserId: string;
  ownerMembershipId: string;
  created: boolean;
}

/**
 * Creates (or re-confirms) an organisation, its first location and its owner's
 * membership. Safe to re-run with the same organisation id: nothing is
 * duplicated and the audit row is written only when something was inserted.
 */
export async function createOrganisation(
  db: Db,
  input: CreateOrganisationInput,
): Promise<CreateOrganisationResult> {
  const phone = toE164(input.ownerPhone);
  if (!phone) throw new Error("Owner phone is not a valid Indian mobile number");
  if (!UUID.test(input.operatorId)) throw new Error("Operator id must be a UUID");
  const organisationId = input.organisationId ?? randomUUID();

  const owner = await db.withSystem("operator", (sys) =>
    sys.user.upsert({ where: { phone }, create: { phone }, update: {} }),
  );

  return db.withTenant(organisationId, async (ctx) => {
    const { tx } = ctx;
    let created = false;

    let organisation = await tx.organisation.findUnique({ where: { id: organisationId } });
    if (!organisation) {
      organisation = await tx.organisation.create({
        data: { id: organisationId, name: input.name },
      });
      created = true;
    }

    let location = await tx.location.findUnique({
      where: { organisationId_name: { organisationId, name: input.locationName } },
    });
    if (!location) {
      location = await tx.location.create({ data: { organisationId, name: input.locationName } });
      created = true;
    }

    let membership = await tx.membership.findUnique({
      where: { organisationId_userId: { organisationId, userId: owner.id } },
    });
    if (!membership) {
      membership = await tx.membership.create({
        data: { organisationId, userId: owner.id, roles: ["owner"] },
      });
      created = true;
    }

    if (created) {
      await audit(ctx, {
        actorType: "operator",
        actorId: input.operatorId,
        action: "organisation.create",
        entityType: "organisation",
        entityIds: [organisation.id, location.id, membership.id],
      });
    }

    return {
      organisationId,
      locationId: location.id,
      ownerUserId: owner.id,
      ownerMembershipId: membership.id,
      created,
    };
  });
}

/** Reads the operator id from the environment; every ops command needs one. */
export function requireOperatorId(env: Record<string, string | undefined>): string {
  const id = env["OPERATOR_ID"];
  if (!id || !UUID.test(id)) {
    throw new Error("Set OPERATOR_ID to your operator UUID before running this command");
  }
  return id;
}

/** Parses `ops:create-org` arguments. Throws with a usage hint on anything missing. */
export function parseCreateOrganisationArgs(
  argv: string[],
  env: Record<string, string | undefined>,
): CreateOrganisationInput {
  const { values } = parseArgs({
    args: argv,
    options: {
      name: { type: "string" },
      location: { type: "string" },
      "owner-phone": { type: "string" },
      "org-id": { type: "string" },
    },
    strict: true,
  });
  for (const flag of ["name", "location", "owner-phone"] as const) {
    if (!values[flag]) throw new Error(`Missing --${flag}`);
  }
  const ownerPhone = toE164(values["owner-phone"] ?? "");
  if (!ownerPhone) throw new Error("--owner-phone is not a valid Indian mobile number");
  const orgId = values["org-id"];
  if (orgId !== undefined && !UUID.test(orgId)) throw new Error("--org-id must be a UUID");
  return {
    name: values.name ?? "",
    locationName: values.location ?? "",
    ownerPhone,
    operatorId: requireOperatorId(env),
    ...(orgId ? { organisationId: orgId } : {}),
  };
}
