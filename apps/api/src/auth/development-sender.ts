import type { Env } from "../config/env.js";

/** Throws unless APP_ENV allows a development sender. */
export function assertDevelopmentSender(env: Pick<Env, "APP_ENV">, name: string): void {
  if (env.APP_ENV !== "local" && env.APP_ENV !== "test") {
    throw new Error(`${name} can only run when APP_ENV is local or test`);
  }
}
