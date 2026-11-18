import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import type { Db } from "@careloop/db";
import { requestOtpBodySchema } from "@careloop/shared/schemas";
import { DB } from "../../src/infra/tokens.js";

// Test-only routes. They are registered by the testing module and never by the app.

/** Stands in for the sign-in route: validates a phone with the shared schema. */
@Controller("test/phone")
export class PhoneEchoController {
  @Post()
  @HttpCode(200)
  accept(@Body({ schema: requestOtpBodySchema }) _body: unknown): { ok: true } {
    return { ok: true };
  }
}

const SOME_ORGANISATION = "00000000-0000-4000-8000-0000000000aa";

/** Runs a query that fails in Postgres and carries the phone as a parameter. */
@Controller("test/failing-query")
export class FailingQueryController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Post()
  async run(@Body({ schema: requestOtpBodySchema }) body: { phone: string }): Promise<never> {
    await this.db.withTenant(SOME_ORGANISATION, async ({ tx }) => {
      // Casting the phone to an integer fails, and Postgres echoes the value in its message.
      await tx.$queryRaw`SELECT ${body.phone}::int`;
    });
    throw new Error("unreachable");
  }
}
