import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import { ErrorCode } from "@careloop/shared/errors";
import {
  changeRolesBodySchema,
  inviteMemberBodySchema,
  uuidSchema,
  type Membership,
  type MembershipList,
  type Role,
} from "@careloop/shared/schemas";
import { AppError } from "../common/app-error.js";
import { RequirePermission } from "../common/permission.decorator.js";
import { contextOf } from "../common/request-context.js";
import { MembershipsService, type Actor } from "./memberships.service.js";

const membershipIdParam = { schema: uuidSchema };

/** The signed-in user and active organisation the guards resolved for this request. */
function actorOf(req: IncomingMessage): Actor {
  const context = contextOf(req);
  if (!context?.userId) throw new AppError(ErrorCode.unauthenticated);
  if (!context.organisationId) throw new AppError(ErrorCode.org_not_selected);
  return {
    userId: context.userId,
    organisationId: context.organisationId,
    requestId: context.requestId,
  };
}

@Controller("memberships")
export class MembershipsController {
  constructor(@Inject(MembershipsService) private readonly memberships: MembershipsService) {}

  @RequirePermission("members.read")
  @Get()
  list(@Req() req: IncomingMessage): Promise<MembershipList> {
    return this.memberships.list(actorOf(req));
  }

  @RequirePermission("members.manage")
  @Post()
  invite(
    @Body({ schema: inviteMemberBodySchema }) body: { phone: string; roles: Role[] },
    @Req() req: IncomingMessage,
  ): Promise<Membership> {
    return this.memberships.invite(actorOf(req), body.phone, body.roles);
  }

  @RequirePermission("members.manage")
  @Patch(":membershipId/roles")
  changeRoles(
    @Param("membershipId", membershipIdParam) membershipId: string,
    @Body({ schema: changeRolesBodySchema }) body: { roles: Role[] },
    @Req() req: IncomingMessage,
  ): Promise<Membership> {
    return this.memberships.changeRoles(actorOf(req), membershipId, body.roles);
  }

  @RequirePermission("members.manage")
  @Post(":membershipId/deactivate")
  @HttpCode(200)
  deactivate(
    @Param("membershipId", membershipIdParam) membershipId: string,
    @Req() req: IncomingMessage,
  ): Promise<Membership> {
    return this.memberships.deactivate(actorOf(req), membershipId);
  }

  @RequirePermission("members.manage")
  @Post(":membershipId/reactivate")
  @HttpCode(200)
  reactivate(
    @Param("membershipId", membershipIdParam) membershipId: string,
    @Req() req: IncomingMessage,
  ): Promise<Membership> {
    return this.memberships.reactivate(actorOf(req), membershipId);
  }
}
