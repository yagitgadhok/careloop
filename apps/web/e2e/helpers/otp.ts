import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createSecurityKeys } from "@careloop/db";
import { expect, type Page } from "@playwright/test";
import { Redis } from "ioredis";

const rootEnv = resolve(import.meta.dirname, "../../../../.env");
if (existsSync(rootEnv) && !process.env["CI"]) process.loadEnvFile(rootEnv);

const keys = createSecurityKeys({ phonePepper: process.env["PHONE_HASH_PEPPER"] ?? "" });
const redis = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379");

/** Made-up demo staff from the seed (the reserved 99999 000xx block). */
export const DEMO = {
  sunriseOwner: "9999900001",
  sunriseFrontDesk: "9999900002",
  sharedDoctor: "9999900003",
} as const;

/** Clears sign-in counters so repeated local runs never hit the daily limits. */
async function resetLimits(phone: string): Promise<void> {
  const phoneHash = keys.phoneHash(phone);
  for (const pattern of keys.otp.allForPhone(phoneHash)) {
    const matches = pattern.includes("*") ? await redis.keys(pattern) : [pattern];
    if (matches.length) await redis.del(...matches);
  }
  await redis.del(`test:otp:${phoneHash}`);
}

/** Reads the code the API's test sender stored for this phone. */
async function readCode(phone: string): Promise<string> {
  const key = `test:otp:${keys.phoneHash(phone)}`;
  let code: string | null = null;
  await expect
    .poll(async () => (code = await redis.get(key)), { timeout: 10_000 })
    .toMatch(/^\d{6}$/);
  return code ?? "";
}

/** Signs in through the real sign-in screen with a seeded phone. */
export async function signIn(page: Page, phone: string): Promise<void> {
  await resetLimits(phone);
  await page.goto("/sign-in");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  const code = await readCode(phone);
  // The form submits itself once all six digits are in.
  await page.getByLabel("Digit 1 of 6").pressSequentially(code);
  await page.waitForURL((url) => url.pathname !== "/sign-in");
}

export async function closeRedis(): Promise<void> {
  redis.disconnect();
}
