import { existsSync } from "node:fs";
import { resolve } from "node:path";

const rootEnv = resolve(import.meta.dirname, "../../../.env");
if (existsSync(rootEnv) && !process.env["CI"]) process.loadEnvFile(rootEnv);
process.env["APP_ENV"] ??= "test";
