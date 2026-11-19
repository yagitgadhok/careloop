import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { closeRedis, DEMO, requestCode, signIn } from "./helpers/otp";

// The first slice of the critical path: staff sign in and land in the right
// clinic with the right navigation. Later milestones extend this file
// (register patient, book, visit, prescription, bill, reminder queued).

test.afterAll(async () => {
  await closeRedis();
});

test("the clinic owner signs in, lands on the dashboard and sees the team", async ({ page }) => {
  await signIn(page, DEMO.sunriseOwner);
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Sunrise Family Clinic").first()).toBeVisible();

  await page.getByRole("link", { name: "Team" }).first().click();
  await expect(page).toHaveURL("/team");
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  // The seeded front-desk colleague is listed (+91 99999 00002).
  await expect(page.getByText("00002")).toBeVisible();
});

test("a doctor at two clinics picks one and works in it", async ({ page }) => {
  await signIn(page, DEMO.sharedDoctor);
  await expect(page).toHaveURL("/choose-clinic");
  await page.getByText("Lotus Polyclinic").click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Lotus Polyclinic").first()).toBeVisible();
});

test("front desk has no Team link and is turned away from the page", async ({ page }) => {
  await signIn(page, DEMO.sunriseFrontDesk);
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Team" })).toHaveCount(0);
  await page.goto("/team");
  await expect(page.getByRole("heading", { name: "You can’t open this page" })).toBeVisible();
});

test("the sign-in screen has no serious accessibility violations", async ({ page }) => {
  await page.goto("/sign-in");
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious.map((v) => v.id)).toEqual([]);
});

test("after a wrong code, focus returns to the first code cell", async ({ page }) => {
  const code = await requestCode(page, DEMO.sunriseFrontDesk);
  const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
  const first = page.getByLabel("Digit 1 of 6");
  await first.pressSequentially(wrong);
  await expect(page.getByText("That code is wrong or has expired.")).toBeVisible();
  await expect(first).toBeEnabled();
  await expect(first).toBeFocused();
});
