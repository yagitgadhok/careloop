import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { createDb, createSecurityKeys, type Db } from "@careloop/db";
import { Redis } from "ioredis";
import { createLogger, type Logger } from "../common/logger.js";
import { loadEnv, type Env } from "../config/env.js";
import { DB, ENV, LOGGER, REDIS, SECURITY_KEYS } from "./tokens.js";

/**
 * Configuration, logger, database, Redis and the phone-hash keys, available
 * to every module.
 */
@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: (): Env => loadEnv() },
    { provide: LOGGER, useFactory: (env: Env) => createLogger(env), inject: [ENV] },
    {
      provide: DB,
      useFactory: (env: Env): Db => createDb({ connectionString: env.DATABASE_URL }),
      inject: [ENV],
    },
    {
      provide: REDIS,
      useFactory: (env: Env, logger: Logger): Redis => {
        const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
        // Without a listener ioredis prints connection errors itself. Log the code only.
        redis.on("error", (error: unknown) => logger.warn({ err: error }, "redis error"));
        return redis;
      },
      inject: [ENV, LOGGER],
    },
    {
      provide: SECURITY_KEYS,
      useFactory: (env: Env) => createSecurityKeys({ phonePepper: env.PHONE_HASH_PEPPER }),
      inject: [ENV],
    },
  ],
  exports: [ENV, LOGGER, DB, REDIS, SECURITY_KEYS],
})
export class InfraModule implements OnApplicationShutdown {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.disconnect();
    this.redis.disconnect();
  }
}
