import { Controller, Get, Req } from "@nestjs/common";
import type { PrincipalRequest } from "./principal-middleware.ts";

@Controller("me")
export class MeController {
  @Get()
  getMe(@Req() request: PrincipalRequest) {
    const principal = request.principal;
    if (!principal) throw new Error("principal middleware invariant violated");
    return {
      memberId: principal.memberId,
      tenantId: principal.tenantId,
      roles: principal.roles,
    };
  }
}
