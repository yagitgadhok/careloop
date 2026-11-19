import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ErrorCode } from "@careloop/shared/errors";
import type { Role } from "@careloop/shared/schemas";

/**
 * What the API knows about the request in flight. Holds ids only: never phone
 * numbers, names or any other patient or user data.
 */
export interface RequestContext {
  readonly requestId: string;
  /** The signed-in user, once authentication has run. */
  userId?: string;
  sessionId?: string;
  /**
   * The organisation the session is working in, read from the session row on
   * the server. Set only while the user's membership there is active.
   */
  organisationId?: string;
  /** The user's roles in that organisation, from the live membership. */
  roles?: readonly Role[];
  /** The error code the response carried, for the request log line. */
  errorCode?: ErrorCode;
  /** The error class name, logged only in local development. */
  errorName?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();
const contextByRequest = new WeakMap<IncomingMessage, RequestContext>();

type Next = (error?: unknown) => void;

/** The context of the request in flight, if any. */
export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

/** The context attached to a request object. Works where async context is lost. */
export function contextOf(req: IncomingMessage): RequestContext | undefined {
  return contextByRequest.get(req);
}

/**
 * First middleware: gives every request a fresh id (client-sent ids are
 * ignored) and returns it in `x-request-id`.
 */
export function assignRequestId(req: IncomingMessage, res: ServerResponse, next: Next): void {
  const context: RequestContext = { requestId: randomUUID() };
  contextByRequest.set(req, context);
  res.setHeader("x-request-id", context.requestId);
  next();
}

/**
 * Runs the rest of the chain inside the request's async context. Mounted after
 * the body parser, whose stream callbacks would otherwise drop the context.
 */
export function runInRequestContext(req: IncomingMessage, _res: ServerResponse, next: Next): void {
  const context = contextByRequest.get(req);
  if (!context) {
    next(new Error("Request context missing: assignRequestId must run first"));
    return;
  }
  storage.run(context, next);
}
