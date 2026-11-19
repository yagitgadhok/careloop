import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module.js";
import { AuthGuard } from "./common/auth.guard.js";
import { AppExceptionFilter } from "./common/exception.filter.js";
import { OriginGuard } from "./common/origin.guard.js";
import { createValidationPipe } from "./common/validation.js";
import { HealthModule } from "./health/health.module.js";
import { InfraModule } from "./infra/infra.module.js";

@Module({
  imports: [InfraModule, HealthModule, AuthModule],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    // Registered first, so forged requests stop before any later guard runs.
    { provide: APP_GUARD, useClass: OriginGuard },
    // Then authentication: session, user status, live membership, active organisation.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
