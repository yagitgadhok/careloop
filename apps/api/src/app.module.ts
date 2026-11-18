import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import { AppExceptionFilter } from "./common/exception.filter.js";
import { OriginGuard } from "./common/origin.guard.js";
import { createValidationPipe } from "./common/validation.js";
import { HealthModule } from "./health/health.module.js";
import { InfraModule } from "./infra/infra.module.js";

@Module({
  imports: [InfraModule, HealthModule],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    // Registered first, so forged requests stop before any later guard runs.
    { provide: APP_GUARD, useClass: OriginGuard },
  ],
})
export class AppModule {}
