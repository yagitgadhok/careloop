import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { configureApp } from "./app.setup.js";
import { NestPinoLogger, type Logger } from "./common/logger.js";
import { loadEnvOrExit } from "./config/env.js";
import { LOGGER } from "./infra/tokens.js";

async function bootstrap(): Promise<void> {
  // Fail fast, naming only the bad variables, before anything connects.
  const env = loadEnvOrExit();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  const logger = app.get<Logger>(LOGGER);
  app.useLogger(new NestPinoLogger(logger));
  configureApp(app);
  app.enableShutdownHooks();

  await app.listen(env.API_PORT);
  logger.info({ port: env.API_PORT }, "api listening");
}

await bootstrap();
