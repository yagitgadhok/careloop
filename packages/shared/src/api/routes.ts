import type { z } from "zod";
import {
  okResponseSchema,
  requestOtpBodySchema,
  selectOrgBodySchema,
  selectOrgResponseSchema,
  sessionResponseSchema,
  verifyOtpBodySchema,
  verifyOtpResponseSchema,
} from "../schemas/auth.js";
import {
  changeRolesBodySchema,
  inviteMemberBodySchema,
  membershipListSchema,
  membershipSchema,
} from "../schemas/membership.js";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * One API endpoint. `path` is what the browser calls on the web origin; a
 * `:name` segment is a path parameter. `body` is null for routes that take none.
 */
export interface RouteDef<
  Path extends string = string,
  Body extends z.ZodType | null = z.ZodType | null,
  Response extends z.ZodType = z.ZodType,
> {
  readonly method: HttpMethod;
  readonly path: Path;
  readonly body: Body;
  readonly response: Response;
}

function route<
  const Path extends string,
  Body extends z.ZodType | null,
  Response extends z.ZodType,
>(def: RouteDef<Path, Body, Response>): RouteDef<Path, Body, Response> {
  return def;
}

export const apiRoutes = {
  auth: {
    session: route({
      method: "GET",
      path: "/api/auth/session",
      body: null,
      response: sessionResponseSchema,
    }),
    requestOtp: route({
      method: "POST",
      path: "/api/auth/otp/request",
      body: requestOtpBodySchema,
      response: okResponseSchema,
    }),
    verifyOtp: route({
      method: "POST",
      path: "/api/auth/otp/verify",
      body: verifyOtpBodySchema,
      response: verifyOtpResponseSchema,
    }),
    selectOrg: route({
      method: "POST",
      path: "/api/auth/org/select",
      body: selectOrgBodySchema,
      response: selectOrgResponseSchema,
    }),
    refresh: route({
      method: "POST",
      path: "/api/auth/refresh",
      body: null,
      response: okResponseSchema,
    }),
    logout: route({
      method: "POST",
      path: "/api/auth/logout",
      body: null,
      response: okResponseSchema,
    }),
    logoutOthers: route({
      method: "POST",
      path: "/api/auth/logout-others",
      body: null,
      response: okResponseSchema,
    }),
  },
  memberships: {
    list: route({
      method: "GET",
      path: "/api/memberships",
      body: null,
      response: membershipListSchema,
    }),
    invite: route({
      method: "POST",
      path: "/api/memberships",
      body: inviteMemberBodySchema,
      response: membershipSchema,
    }),
    changeRoles: route({
      method: "PATCH",
      path: "/api/memberships/:membershipId/roles",
      body: changeRolesBodySchema,
      response: membershipSchema,
    }),
    deactivate: route({
      method: "POST",
      path: "/api/memberships/:membershipId/deactivate",
      body: null,
      response: membershipSchema,
    }),
    reactivate: route({
      method: "POST",
      path: "/api/memberships/:membershipId/reactivate",
      body: null,
      response: membershipSchema,
    }),
  },
} as const;
