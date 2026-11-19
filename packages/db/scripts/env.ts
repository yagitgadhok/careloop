import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Loads the repo-root .env for scripts run outside CI. Real env vars win. */
export function loadRootEnv(): void {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate) && existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
      process.loadEnvFile(candidate);
      return;
    }
    dir = resolve(dir, "..");
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

/** Development-only tools (seed, console senders) run only in these environments. */
export function isLocalOrTest(): boolean {
  const env = process.env["APP_ENV"];
  return env === "local" || env === "test";
}
