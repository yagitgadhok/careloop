import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { createHttpLogger, type Logger } from "./common/logger.js";
import { assignRequestId, runInRequestContext } from "./common/request-context.js";
import type { Env } from "./config/env.js";
import { ENV, LOGGER } from "./infra/tokens.js";

/**
 * HTTP setup shared by main.ts and the e2e tests. The app must be created with
 * `bodyParser: false`, so JSON is the only body format parsed. CORS stays off:
 * browsers reach the API same-origin through the web app.
 */
export function configureApp(app: NestExpressApplication): void {
  const env = app.get<Env>(ENV);
  const logger = app.get<Logger>(LOGGER);

  app.set("trust proxy", trustProxySetting(env.TRUST_PROXY));
  app.setGlobalPrefix("api");
  app.use(assignRequestId);
  app.use(createHttpLogger(logger, env));
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser("json");
  app.use(runInRequestContext);
}

/** Express accepts a hop count, true/false, or a list of addresses and named ranges. */
function trustProxySetting(value: string): string | number | boolean {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === "true" || value === "false") return value === "true";
  return value;
}
