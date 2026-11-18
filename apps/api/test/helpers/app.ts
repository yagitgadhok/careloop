import type { INestApplication, Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import { configureApp } from "../../src/app.setup.js";
import { createLogger } from "../../src/common/logger.js";
import type { Env } from "../../src/config/env.js";
import { ENV, LOGGER } from "../../src/infra/tokens.js";

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  /** Every log line the app wrote, as raw JSON strings. */
  logs: string[];
  /** The origin the app accepts state-changing requests from. */
  origin: string;
  close(): Promise<void>;
}

export interface TestAppOptions {
  /** Test-only controllers, registered in this testing module and nowhere else. */
  controllers?: Type[];
  /** Providers to replace, such as a Redis client pointed at a closed port. */
  overrides?: Array<{ token: string | symbol; value: unknown }>;
}

/** Boots the real API (global pipe, filter, guard, middleware) against Compose Postgres and Redis. */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const logs: string[] = [];
  const stream = { write: (line: string) => void logs.push(line) };

  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(LOGGER)
    .useFactory({ factory: (env: Env) => createLogger(env, stream), inject: [ENV] });
  for (const { token, value } of options.overrides ?? []) {
    builder = builder.overrideProvider(token).useValue(value);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();

  const env = app.get<Env>(ENV);
  return {
    app,
    http: request(app.getHttpServer()),
    logs,
    origin: env.WEB_ORIGIN,
    close: () => app.close(),
  };
}

/** Parsed log lines, for asserting on their fields. */
export function parseLogs(logs: string[]): Array<Record<string, unknown>> {
  return logs.map((line) => JSON.parse(line) as Record<string, unknown>);
}
