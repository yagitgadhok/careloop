import type { IncomingMessage, ServerResponse } from "node:http";
import type { LoggerService } from "@nestjs/common";
import { pino, type DestinationStream, type Logger } from "pino";
import { pinoHttp, type HttpLogger } from "pino-http";
import type { Env } from "../config/env.js";
import { contextOf } from "./request-context.js";

export type { Logger };

/**
 * Builds the app logger. Serializers are allowlists: a request, response or
 * error object passed to it is reduced to safe fields, never bodies, headers,
 * URLs, messages or stacks.
 */
export function createLogger(env: Pick<Env, "APP_ENV">, destination?: DestinationStream): Logger {
  const local = env.APP_ENV === "local";
  return pino(
    {
      level: env.APP_ENV === "test" ? "debug" : "info",
      base: { env: env.APP_ENV },
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: {
        req: (req: IncomingMessage) => ({ method: req.method, route: routeTemplate(req) }),
        res: (res: ServerResponse) => ({ status: res.statusCode }),
        err: (err: unknown) => errorFields(err, local),
      },
    },
    destination ?? pino.destination({ sync: false }),
  );
}

/** Error details that are safe to log: a code if it carries one, and the class name only locally. */
function errorFields(err: unknown, local: boolean): Record<string, string> {
  const fields: Record<string, string> = {};
  if (err && typeof err === "object") {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Za-z0-9_]{1,64}$/.test(code)) fields["code"] = code;
    if (local && err instanceof Error) fields["name"] = err.name;
  }
  return fields;
}

interface RoutedRequest extends IncomingMessage {
  baseUrl?: string;
  route?: { path?: unknown };
}

/** The matched route pattern (`/api/memberships/:membershipId/roles`), or null when no route matched. */
export function routeTemplate(req: IncomingMessage): string | null {
  const { route, baseUrl } = req as RoutedRequest;
  if (!route || typeof route.path !== "string") return null;
  return `${baseUrl ?? ""}${route.path}`;
}

/** One log line per request, built field by field from the allowlist. */
export function createHttpLogger(logger: Logger, env: Pick<Env, "APP_ENV">): HttpLogger {
  const local = env.APP_ENV === "local";
  const line = (req: IncomingMessage, res: ServerResponse) => {
    const context = contextOf(req);
    return {
      method: req.method,
      route: routeTemplate(req),
      status: res.statusCode,
      ...(context?.userId ? { userId: context.userId } : {}),
      ...(context?.sessionId ? { sessionId: context.sessionId } : {}),
      ...(context?.organisationId ? { organisationId: context.organisationId } : {}),
      ...(context?.errorCode ? { errorCode: context.errorCode } : {}),
      ...(local && context?.errorName ? { errorName: context.errorName } : {}),
    };
  };
  return pinoHttp({
    logger,
    genReqId: (req) => contextOf(req)?.requestId ?? "unknown",
    customAttributeKeys: { reqId: "requestId" },
    // Bind only the request id up front; everything else is added at the end.
    quietReqLogger: true,
    quietResLogger: true,
    customLogLevel: (_req, res) =>
      res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    customSuccessObject: (req, res) => line(req, res),
    customErrorObject: (req, res) => line(req, res),
    customSuccessMessage: () => "request completed",
    customErrorMessage: () => "request failed",
  });
}

/**
 * Routes Nest's own log calls to pino. Only string messages and their context
 * are kept; stacks and objects are dropped, as they can carry request data.
 */
export class NestPinoLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, context?: unknown): void {
    this.write("info", message, context);
  }
  error(message: unknown, _stack?: unknown, context?: unknown): void {
    this.write("error", message, context);
  }
  warn(message: unknown, context?: unknown): void {
    this.write("warn", message, context);
  }
  debug(message: unknown, context?: unknown): void {
    this.write("debug", message, context);
  }
  verbose(message: unknown, context?: unknown): void {
    this.write("trace", message, context);
  }

  private write(
    level: "info" | "error" | "warn" | "debug" | "trace",
    message: unknown,
    context: unknown,
  ) {
    const fields = typeof context === "string" ? { context } : {};
    this.logger[level](
      fields,
      typeof message === "string" ? message : "(non-text message omitted)",
    );
  }
}
