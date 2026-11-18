import { StandardSchemaValidationPipe } from "@nestjs/common";
import { ErrorCode, type FieldError } from "@careloop/shared/errors";
import { AppError } from "./app-error.js";

interface Issue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

// A message is passed on only when it is itself a code (custom issues use codes as messages).
const CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

function pathOf(issue: Issue): string {
  return (issue.path ?? [])
    .map((segment) => String(typeof segment === "object" ? segment.key : segment))
    .join(".");
}

/**
 * The issue's code. Zod issues carry one (`invalid_type`, `too_small`); a custom
 * issue's message is the code. Anything else gets a generic code, so no message
 * that might quote the input is returned.
 */
function codeOf(issue: Issue): string {
  const code = (issue as { code?: unknown }).code;
  if (typeof code === "string" && code !== "custom" && CODE_PATTERN.test(code)) return code;
  return CODE_PATTERN.test(issue.message) ? issue.message : "invalid";
}

/** Field paths and codes only: submitted values never leave the server. */
export function toFieldErrors(issues: readonly Issue[]): FieldError[] {
  return issues.map((issue) => ({ path: pathOf(issue), code: codeOf(issue) }));
}

/**
 * The global pipe: validates every parameter declared with a schema, such as
 * `@Body({ schema: requestOtpBodySchema })`, against the shared Zod schemas.
 */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) =>
      new AppError(ErrorCode.validation_failed, { fields: toFieldErrors(issues) }),
  });
}
