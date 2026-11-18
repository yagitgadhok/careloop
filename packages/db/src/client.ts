import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export interface DbOptions {
  /** Connection string for the application role (careloop_app). */
  connectionString: string;
  /** Interactive transaction timeout in milliseconds. */
  transactionTimeoutMs?: number;
}

/** Creates the raw Prisma client. Not exported from the package entry point. */
export function createPrismaClient(options: DbOptions): PrismaClient {
  const adapter = new PrismaPg({ connectionString: options.connectionString });
  return new PrismaClient({ adapter, log: [] });
}

export type { PrismaClient };
