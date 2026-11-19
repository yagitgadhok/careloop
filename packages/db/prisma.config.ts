import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

// Load the repo-root .env when present (CI sets real environment variables).
const rootEnv = resolve(import.meta.dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// Migrations run as the owner role; the application never uses this URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_OWNER_URL"] ?? "",
    shadowDatabaseUrl: process.env["DATABASE_SHADOW_URL"],
  },
});
