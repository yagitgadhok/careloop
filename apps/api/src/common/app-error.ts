import type { ErrorCode, FieldError } from "@careloop/shared/errors";

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  validation_failed: 400,
  unauthenticated: 401,
  session_revoked: 401,
  org_not_selected: 403,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  invalid_code: 400,
  last_owner: 409,
  internal_error: 500,
};

/**
 * An expected failure, answered as `{ code, requestId }` with this HTTP status.
 * The message is the code: never put user or patient data in an AppError.
 */
export class AppError extends Error {
  override readonly name = "AppError";
  readonly status: number;
  readonly fields: readonly FieldError[] | undefined;

  constructor(
    readonly code: ErrorCode,
    options: { status?: number; fields?: readonly FieldError[] } = {},
  ) {
    super(code);
    this.status = options.status ?? DEFAULT_STATUS[code];
    this.fields = options.fields;
  }
}
