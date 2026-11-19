import type { z } from "zod";
import { ErrorCode, errorResponseSchema, type FieldError } from "../errors.js";
import type { RouteDef } from "./routes.js";

/** The part of `fetch` the client uses, so browser, server and mobile can pass their own. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

type PathParamNames<Path extends string> = Path extends `${string}:${infer Name}/${infer Rest}`
  ? Name | PathParamNames<`/${Rest}`>
  : Path extends `${string}:${infer Name}`
    ? Name
    : never;

type ParamsInput<Path extends string> = [PathParamNames<Path>] extends [never]
  ? Record<never, never>
  : { params: Record<PathParamNames<Path>, string> };

type BodyInput<Body> = Body extends z.ZodType ? { body: z.input<Body> } : Record<never, never>;

export type RouteInput<R extends RouteDef> = ParamsInput<R["path"]> &
  BodyInput<R["body"]> & { headers?: Record<string, string> };

export type RouteOutput<R extends RouteDef> = z.output<R["response"]>;

/** An API failure, carrying the stable error code. The message is the code, never user data. */
export class ApiError extends Error {
  override readonly name = "ApiError";

  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly requestId?: string,
    readonly fields?: readonly FieldError[],
  ) {
    super(code);
  }
}

/** True when the API refused the call because the session is missing, expired or revoked. */
export function isSessionEnded(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    (error.code === ErrorCode.unauthenticated || error.code === ErrorCode.session_revoked)
  );
}

/** The API error code, or `internal_error` for anything that is not an API failure. */
export function errorCodeOf(error: unknown): ErrorCode {
  return error instanceof ApiError ? error.code : ErrorCode.internal_error;
}

export interface ApiClientOptions {
  fetch: FetchLike;
  /** Prefix for every path. Empty for same-origin browser calls. */
  baseUrl?: string;
  /** Headers added to every call, such as a forwarded cookie on the server. */
  headers?: () => Record<string, string>;
}

function buildPath(path: string, params: Record<string, string> | undefined): string {
  return path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined) throw new TypeError(`Missing path parameter ${name}`);
    return encodeURIComponent(value);
  });
}

async function readJson(response: { json(): Promise<unknown> }): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl ?? "";

  async function request<R extends RouteDef>(
    route: R,
    input: RouteInput<R>,
  ): Promise<RouteOutput<R>> {
    const { params, body, headers } = input as {
      params?: Record<string, string>;
      body?: unknown;
      headers?: Record<string, string>;
    };
    const init: Parameters<FetchLike>[1] = {
      method: route.method,
      headers: {
        accept: "application/json",
        ...options.headers?.(),
        ...headers,
        ...(route.body ? { "content-type": "application/json" } : {}),
      },
    };
    if (route.body) init.body = JSON.stringify(body);

    const response = await options.fetch(baseUrl + buildPath(route.path, params), init);
    const json = await readJson(response);

    if (!response.ok) {
      const error = errorResponseSchema.safeParse(json);
      if (error.success) {
        throw new ApiError(
          error.data.code,
          response.status,
          error.data.requestId,
          error.data.fields,
        );
      }
      throw new ApiError(ErrorCode.internal_error, response.status);
    }

    const parsed = route.response.safeParse(json);
    if (!parsed.success) throw new ApiError(ErrorCode.internal_error, response.status);
    return parsed.data as RouteOutput<R>;
  }

  return { request };
}

export type ApiClient = ReturnType<typeof createApiClient>;
