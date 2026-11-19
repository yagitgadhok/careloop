import { defineConfig, devices } from "@playwright/test";

// Both servers run with APP_ENV=test so the API writes sign-in codes to the
// test Redis key the helper reads, instead of sending anything.
const testEnv = { ...process.env, APP_ENV: "test", NODE_ENV: "production" } as Record<
  string,
  string
>;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node ../api/dist/main.js",
      url: "http://localhost:4000/api/health",
      env: testEnv,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "pnpm exec next start -p 3000",
      url: "http://localhost:3000/sign-in",
      env: { ...testEnv, API_ORIGIN: "http://localhost:4000", WEB_ORIGIN: "http://localhost:3000" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
