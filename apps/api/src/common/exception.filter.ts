import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ErrorCode, type ErrorResponse } from "@careloop/shared/errors";
import { AppError } from "./app-error.js";
import { contextOf } from "./request-context.js";

/** Codes for framework HTTP errors (unknown route, malformed JSON, body too large). */
function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return ErrorCode.unauthenticated;
    case 403:
      return ErrorCode.forbidden;
    case 404:
      return ErrorCode.not_found;
    case 409:
      return ErrorCode.conflict;
    case 429:
      return ErrorCode.rate_limited;
    default:
      return status >= 500 ? ErrorCode.internal_error : ErrorCode.validation_failed;
  }
}

/**
 * The one place errors become responses: `{ code, requestId }`, plus field
 * paths and codes for validation. Messages, stacks, Prisma errors and input
 * values never reach the client; anything unrecognised is a 500.
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<IncomingMessage>();
    const res = http.getResponse<ServerResponse>();
    const context = contextOf(req);

    let status = 500;
    let code: ErrorCode = ErrorCode.internal_error;
    let fields: ErrorResponse["fields"];
    if (exception instanceof AppError) {
      status = exception.status;
      code = exception.code;
      fields = exception.fields ? [...exception.fields] : undefined;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = codeForStatus(status);
    }

    if (context) {
      context.errorCode = code;
      if (exception instanceof Error) context.errorName = exception.name;
    }

    if (res.headersSent) {
      res.destroy();
      return;
    }
    const body: ErrorResponse = {
      code,
      requestId: context?.requestId ?? "unknown",
      ...(fields ? { fields } : {}),
    };
    res.statusCode = status;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  }
}
