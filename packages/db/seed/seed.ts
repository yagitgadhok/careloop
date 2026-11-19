/**
 * Made-up demo data: two clinics with staff in every role. Every name and
 * number here is invented. The phone numbers sit in the 99999 000xx block,
 * reserved in this project for demo data; never use real numbers.
 */
import { isLocalOrTest } from "../scripts/env.js";
import { audit, createOrganisation, upsertUserByPhone, type Db, type Role } from "../src/index.js";

const SEED_OPERATOR_ID = "00000000-0000-4000-8000-00000000500d";

export const SEED = {
  sharedDoctorPhone: "+919999900003",
  sunrise: {
    id: "5eed0000-0000-4000-8000-000000000001",
    name: "Sunrise Family Clinic",
    ownerPhone: "+919999900001",
    locations: [{ name: "Main branch", departments: ["General Practice"] }],
    staff: [
      { phone: "+919999900001", roles: ["owner", "doctor"] },
      { phone: "+919999900002", roles: ["front_desk"] },
      { phone: "+919999900003", roles: ["doctor"] },
    ],
  },
  lotus: {
    id: "5eed0000-0000-4000-8000-000000000002",
    name: "Lotus Polyclinic",
    ownerPhone: "+919999900004",
    locations: [
      { name: "Andheri", departments: ["General Medicine", "Paediatrics"] },
      { name: "Bandra", departments: ["Dermatology"] },
    ],
    staff: [
      { phone: "+919999900004", roles: ["owner"] },
      { phone: "+919999900005", roles: ["doctor"] },
      { phone: "+919999900006", roles: ["front_desk"] },
      { phone: "+919999900003", roles: ["doctor"] },
    ],
  },
} as const satisfies Record<string, unknown>;

type ClinicSeed = typeof SEED.sunrise | typeof SEED.lotus;

export function assertSeedAllowed(env: Record<string, string | undefined>): void {
  if (!isLocalOrTest(env)) {
    throw new Error("The seed only runs when APP_ENV is local or test");
  }
}

async function seedClinic(db: Db, clinic: ClinicSeed): Promise<void> {
  const [firstLocation] = clinic.locations;
  if (!firstLocation) throw new Error("A seeded clinic needs a location");
  await createOrganisation(db, {
    organisationId: clinic.id,
    name: clinic.name,
    locationName: firstLocation.name,
    ownerPhone: clinic.ownerPhone,
    operatorId: SEED_OPERATOR_ID,
  });

  const userIds = await db.withSystem("seed", async (sys) => {
    const ids = new Map<string, string>();
    for (const member of clinic.staff) {
      const user = await upsertUserByPhone(sys, member.phone);
      ids.set(member.phone, user.id);
    }
    return ids;
  });

  await db.withTenant(clinic.id, async (ctx) => {
    const { tx } = ctx;
    const inserted: string[] = [];

    for (const loc of clinic.locations) {
      let location = await tx.location.findUnique({
        where: { organisationId_name: { organisationId: clinic.id, name: loc.name } },
      });
      if (!location) {
        location = await tx.location.create({
          data: { organisationId: clinic.id, name: loc.name },
        });
        inserted.push(location.id);
      }
      for (const departmentName of loc.departments) {
        const existing = await tx.department.findUnique({
          where: { locationId_name: { locationId: location.id, name: departmentName } },
        });
        if (!existing) {
          const department = await tx.department.create({
            data: { organisationId: clinic.id, locationId: location.id, name: departmentName },
          });
          inserted.push(department.id);
        }
      }
    }

    for (const member of clinic.staff) {
      const userId = userIds.get(member.phone);
      if (!userId) continue;
      const roles: Role[] = [...member.roles];
      const existing = await tx.membership.findUnique({
        where: { organisationId_userId: { organisationId: clinic.id, userId } },
      });
      if (!existing) {
        const membership = await tx.membership.create({
          data: { organisationId: clinic.id, userId, roles },
        });
        inserted.push(membership.id);
      } else if (existing.roles.join() !== roles.join()) {
        await tx.membership.update({ where: { id: existing.id }, data: { roles } });
        inserted.push(existing.id);
      }
    }

    if (inserted.length) {
      await audit(ctx, {
        actorType: "system",
        action: "seed.apply",
        entityType: "seed",
        entityIds: inserted,
      });
    }
  });
}

export async function runSeed(db: Db): Promise<void> {
  await seedClinic(db, SEED.sunrise);
  await seedClinic(db, SEED.lotus);
}
