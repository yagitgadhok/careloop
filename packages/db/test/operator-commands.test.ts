import { Redis } from "ioredis";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDb,
  createOrganisation,
  createSecurityKeys,
  disableUser,
  unlockPhone,
  type Db,
} from "../src/index.js";
import { appPool } from "./helpers/pg.js";

const OPERATOR_ID = "00000000-0000-4000-8000-0000000000bb";
const keys = createSecurityKeys({ phonePepper: "operator-test-pepper-000000000000" });
let pool: pg.Pool;
let db: Db;
let redis: Redis;

const randomPhone = () => `97${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

beforeAll(() => {
  pool = appPool();
  db = createDb({ connectionString: process.env["DATABASE_URL"] ?? "" });
  redis = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379");
});

afterAll(async () => {
  await db.disconnect();
  await pool.end();
  redis.disconnect();
});

describe("unlockPhone", () => {
  it("clears the lockout, resend gap and daily caps for a phone, and records a security event", async () => {
    const phone = randomPhone();
    const phoneHash = keys.phoneHash(phone);
    const ipHash = keys.ipHash("198.51.100.4");
    const otherPhoneKey = keys.otp.resendGap(keys.phoneHash(randomPhone()));
    await redis.set(keys.otp.lockout(phoneHash, ipHash), "1");
    await redis.set(keys.otp.failures(phoneHash, ipHash), "5");
    await redis.set(keys.otp.dailySends(phoneHash, ipHash), "10");
    await redis.set(keys.otp.resendGap(phoneHash), "1");
    await redis.set(keys.otp.phoneFailures(phoneHash), "20");
    await redis.set(keys.otp.phoneSends(phoneHash), "30");
    await redis.set(otherPhoneKey, "1");

    const cleared = await unlockPhone({ db, redis, keys }, { phone, operatorId: OPERATOR_ID });

    expect(cleared).toBe(6);
    expect(await redis.keys(`otp:*${phoneHash}*`)).toEqual([]);
    expect(await redis.get(otherPhoneKey)).toBe("1");
    const { rows } = await pool.query(
      "SELECT type, actor_type, actor_id FROM security_event WHERE phone_hash = $1",
      [phoneHash],
    );
    expect(rows).toEqual([
      { type: "operator.unlock_phone", actor_type: "operator", actor_id: OPERATOR_ID },
    ]);
    await redis.del(otherPhoneKey);
  });
});

describe("disableUser", () => {
  it("disables the user and revokes every session they hold", async () => {
    const phone = randomPhone();
    const { ownerUserId } = await createOrganisation(db, {
      name: "Disable Test Clinic",
      locationName: "Main",
      ownerPhone: phone,
      operatorId: OPERATOR_ID,
    });
    await db.withSystem("auth", async (sys) => {
      for (const n of [1, 2]) {
        await sys.session.create({
          data: {
            userId: ownerUserId,
            familyId: crypto.randomUUID(),
            refreshTokenHash: `hash-${crypto.randomUUID()}-${n}`,
            expiresAt: new Date(Date.now() + 3_600_000),
          },
        });
      }
    });

    await disableUser({ db, keys }, { phone, operatorId: OPERATOR_ID });

    const user = await pool.query("SELECT status FROM app_user WHERE id = $1", [ownerUserId]);
    expect(user.rows[0]).toEqual({ status: "disabled" });
    const sessions = await pool.query(
      "SELECT count(*)::int AS live FROM session WHERE user_id = $1 AND revoked_at IS NULL",
      [ownerUserId],
    );
    expect(sessions.rows[0]).toEqual({ live: 0 });
    const events = await pool.query(
      "SELECT type FROM security_event WHERE user_id = $1 AND type = 'operator.disable_user'",
      [ownerUserId],
    );
    expect(events.rowCount).toBe(1);
  });

  it("refuses an unknown phone without writing anything", async () => {
    await expect(
      disableUser({ db, keys }, { phone: randomPhone(), operatorId: OPERATOR_ID }),
    ).rejects.toThrow(/No user/);
  });
});
