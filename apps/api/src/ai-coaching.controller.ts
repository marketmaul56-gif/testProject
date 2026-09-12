import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import { coachingResponseSchema } from "@skill-platform/contracts/ai-coaching";
import { AiCoachingService } from "../../../packages/modules/ai-coaching/src/application/coach.ts";
import { AuthorizationDeniedError } from "../../../packages/platform/auth/src/policy.ts";
import type { PrincipalRequest } from "./principal-middleware.ts";
import { authorizeRequest } from "./request-authorization.ts";
import { AI_COACHING_SERVICE } from "./tokens.ts";

@Controller("learner/ai-coach")
export class AiCoachingController {
  constructor(@Inject(AI_COACHING_SERVICE) private readonly coaching: AiCoachingService) {}

  @Post()
  async coach(@Req() request: PrincipalRequest, @Body() rawBody: unknown) {
    const principal = request.principal;
    if (!principal) throw new AuthorizationDeniedError("authenticated principal required");
    if (!principal.roles.includes("LEARNER")) throw new AuthorizationDeniedError("learner role required");
    authorizeRequest(request, "ai:coach", {
      tenantId: principal.tenantId,
      ownerMemberId: principal.memberId,
    });
    return coachingResponseSchema.parse(await this.coaching.coach(rawBody));
  }
}
