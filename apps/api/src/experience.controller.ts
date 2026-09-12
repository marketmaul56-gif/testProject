import { Body, Controller, Get, Inject, Param, Post, Req } from "@nestjs/common";
import { z } from "zod";
import {
  guidanceRequestSchema,
  guidanceResponseSchema,
  instructorCohortOverviewSchema,
  instructorCohortsSchema,
  instructorLearnerDetailSchema,
  learnerOverviewSchema,
} from "@skill-platform/contracts/experience";
import { PgGuidanceWriter } from "../../../packages/modules/cohorts/src/infrastructure/pg-guidance-writer.ts";
import { uuidV7 } from "../../../packages/platform/audit/src/security-audit.ts";
import { AuthorizationDeniedError } from "../../../packages/platform/auth/src/policy.ts";
import { ExperienceReadModel } from "../../../packages/platform/db/src/experience-read-model.ts";
import type { PrincipalRequest } from "./principal-middleware.ts";
import { authorizeRequest } from "./request-authorization.ts";
import { EXPERIENCE_READ_MODEL, GUIDANCE_WRITER } from "./tokens.ts";

const uuidParam = z.string().uuid();

@Controller("learner")
export class LearnerExperienceController {
  constructor(@Inject(EXPERIENCE_READ_MODEL) private readonly readModel: ExperienceReadModel) {}

  @Get("overview")
  async overview(@Req() request: PrincipalRequest) {
    const principal = request.principal;
    if (!principal) throw new AuthorizationDeniedError("authenticated principal required");
    authorizeRequest(request, "learning:read", {
      tenantId: principal.tenantId,
      ownerMemberId: principal.memberId,
    });
    return learnerOverviewSchema.parse(await this.readModel.getLearnerOverview(principal.tenantId, principal.memberId));
  }
}

@Controller("instructor")
export class InstructorExperienceController {
  constructor(
    @Inject(EXPERIENCE_READ_MODEL) private readonly readModel: ExperienceReadModel,
    @Inject(GUIDANCE_WRITER) private readonly guidanceWriter: PgGuidanceWriter,
  ) {}

  @Get("cohorts")
  async cohorts(@Req() request: PrincipalRequest) {
    const principal = request.principal;
    if (!principal) throw new AuthorizationDeniedError("authenticated principal required");
    authorizeRequest(request, "cohort:read", {
      tenantId: principal.tenantId,
      authorizedInstructorIds: [principal.memberId],
    });
    return instructorCohortsSchema.parse(await this.readModel.getInstructorCohorts(principal.tenantId, principal.memberId));
  }

  @Get("cohorts/:cohortId")
  async cohort(@Req() request: PrincipalRequest, @Param("cohortId") cohortIdRaw: string) {
    const principal = request.principal;
    if (!principal) throw new AuthorizationDeniedError("authenticated principal required");
    const cohortId = uuidParam.parse(cohortIdRaw);
    const related = await this.readModel.isInstructorForCohort(principal.tenantId, principal.memberId, cohortId);
    authorizeRequest(request, "cohort:read", {
      tenantId: principal.tenantId,
      authorizedInstructorIds: related ? [principal.memberId] : [],
    });
    const overview = await this.readModel.getInstructorCohortOverview(principal.tenantId, principal.memberId, cohortId);
    if (!overview) throw new AuthorizationDeniedError("cohort relationship required");
    return instructorCohortOverviewSchema.parse(overview);
  }

  @Get("cohorts/:cohortId/learners/:learnerId")
  async learner(
    @Req() request: PrincipalRequest,
    @Param("cohortId") cohortIdRaw: string,
    @Param("learnerId") learnerIdRaw: string,
  ) {
    const principal = request.principal;
    if (!principal) throw new AuthorizationDeniedError("authenticated principal required");
    const cohortId = uuidParam.parse(cohortIdRaw);
    const learnerId = uuidParam.parse(learnerIdRaw);
    const [related, activeLearner] = await Promise.all([
      this.readModel.isInstructorForCohort(principal.tenantId, principal.memberId, cohortId),
      this.readModel.isActiveLearnerInCohort(principal.tenantId, cohortId, learnerId),
    ]);
    authorizeRequest(request, "submission:read", {
      tenantId: principal.tenantId,
      learnerMemberId: learnerId,
      authorizedInstructorIds: related && activeLearner ? [principal.memberId] : [],
    });
    const detail = await this.readModel.getInstructorLearnerDetail(principal.tenantId, cohortId, learnerId);
    if (!detail) throw new AuthorizationDeniedError("learner relationship required");
    return instructorLearnerDetailSchema.parse(detail);
  }

  @Post("cohorts/:cohortId/learners/:learnerId/guidance")
  async createGuidance(
    @Req() request: PrincipalRequest,
    @Param("cohortId") cohortIdRaw: string,
    @Param("learnerId") learnerIdRaw: string,
    @Body() rawBody: unknown,
  ) {
    const principal = request.principal;
    if (!principal) throw new AuthorizationDeniedError("authenticated principal required");
    const cohortId = uuidParam.parse(cohortIdRaw);
    const learnerId = uuidParam.parse(learnerIdRaw);
    const input = guidanceRequestSchema.parse(rawBody);
    const [related, activeLearner] = await Promise.all([
      this.readModel.isInstructorForCohort(principal.tenantId, principal.memberId, cohortId),
      this.readModel.isActiveLearnerInCohort(principal.tenantId, cohortId, learnerId),
    ]);
    authorizeRequest(request, "guidance:create", {
      tenantId: principal.tenantId,
      learnerMemberId: learnerId,
      authorizedInstructorIds: related && activeLearner ? [principal.memberId] : [],
    });
    const createdAt = new Date();
    const guidanceId = uuidV7(createdAt.getTime());
    await this.guidanceWriter.create({
      id: guidanceId,
      tenantId: principal.tenantId,
      cohortId,
      instructorId: principal.memberId,
      learnerId,
      message: input.message,
      createdAt,
    });
    return guidanceResponseSchema.parse({ guidanceId, createdAt: createdAt.toISOString() });
  }
}
