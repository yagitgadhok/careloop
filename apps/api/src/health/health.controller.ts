import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { Db } from "@careloop/db";
import type { Redis } from "ioredis";
import { Public } from "../common/auth.decorators.js";
import { DB, REDIS } from "../infra/tokens.js";

const CHECK_TIMEOUT_MS = 2000;
// The tenant helper needs an organisation id; this one owns no rows, and the check reads none.
const NO_ORGANISATION = "00000000-0000-0000-0000-000000000000";

interface StatusResponse {
  status(code: number): unknown;
}

/** Resolves true if `check` succeeds within the timeout, false otherwise. */
async function passes(check: () => Promise<unknown>): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([check().then(() => true as const), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

@Public()
@Controller("health")
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** 200 when Postgres and Redis both answer, 503 when either does not. */
  @Get()
  async check(@Res({ passthrough: true }) res: StatusResponse): Promise<{ ok: boolean }> {
    const [database, redis] = await Promise.all([
      passes(() => this.db.withTenant(NO_ORGANISATION, ({ tx }) => tx.$queryRaw`SELECT 1`)),
      passes(() => this.redis.ping()),
    ]);
    const ok = database && redis;
    if (!ok) res.status(503);
    return { ok };
  }
}
