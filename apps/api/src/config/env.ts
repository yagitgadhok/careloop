import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";

export const APP_ENVS = ["local", "test", "staging", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

const required = z.string().min(1);
const secret = z.string().min(16);

/** Environments where "trust proxy" must be configured on purpose, not defaulted. */
const DEPLOYED_ENVS: ReadonlySet<AppEnv> = new Set(["staging", "production"]);

const envSchema = z
  .object({
    APP_ENV: z.enum(APP_ENVS),
    DATABASE_URL: required,
    REDIS_URL: required,
    JWT_SECRET: secret,
    JWT_ISSUER: required,
    JWT_AUDIENCE: required,
    OTP_PEPPER: secret,
    PHONE_HASH_PEPPER: secret,
    WEB_ORIGIN: z.url(),
    API_PORT: z.coerce.number().int().min(1).max(65535),
    // Express "trust proxy": which hops may set X-Forwarded-For. The web's
    // rewrite (dev) and the ingress (deployed) forward the client IP.
    // Local and test default to loopback; staging and production must set it,
    // or every client would share the ingress's IP and its rate-limit bucket.
    TRUST_PROXY: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.TRUST_PROXY === undefined && DEPLOYED_ENVS.has(env.APP_ENV)) {
      ctx.addIssue({
        code: "custom",
        path: ["TRUST_PROXY"],
        message: "TRUST_PROXY must be set in staging and production",
      });
    }
  })
  .transform((env) => ({ ...env, TRUST_PROXY: env.TRUST_PROXY ?? "loopback" }));

export type Env = z.infer<typeof envSchema>;

/**
 * Thrown when configuration is invalid. Its message names variables, never their values.
 * (This file sticks to erasable TypeScript so Node can run it without a build.)
 */
export class EnvError extends Error {
  override readonly name = "EnvError";
  readonly variables: readonly string[];

  constructor(variables: readonly string[]) {
    super(`Invalid or missing environment variables: ${variables.join(", ")}`);
    this.variables = variables;
  }
}

/** Loads the repo-root .env when there is one. Variables already set win over it. */
function loadRootEnvFile(): void {
  let dir = import.meta.dirname;
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
      const file = resolve(dir, ".env");
      if (existsSync(file)) process.loadEnvFile(file);
      return;
    }
    dir = dirname(dir);
  }
}

/** Parses configuration from `source`. Throws EnvError naming the bad variables. */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;
  const names = new Set(result.error.issues.map((issue) => String(issue.path[0])));
  throw new EnvError([...names].sort());
}

/** Loads the repo .env (if present) and parses process.env. */
export function loadEnv(): Env {
  loadRootEnvFile();
  return parseEnv(process.env);
}

/** For process start-up: on bad configuration, print the variable names and exit. */
export function loadEnvOrExit(): Env {
  try {
    return loadEnv();
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}
