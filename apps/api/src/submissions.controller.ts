import { Body, Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import {
  practiceSubmissionRequestSchema,
  projectSubmissionRequestSchema,
  submissionQueuedResponseSchema,
} from "@skill-platform/contracts/submissions";
import {
  PgPracticeSubmissionCommands,
  PracticeSubmissionConflictError,
  PracticeSubmissionNotEligibleError,
} from "../../../packages/modules/practice/src/infrastructure/pg-submission-commands.ts";
import {
  PgProjectSubmissionCommands,
  ProjectSubmissionConflictError,
  ProjectSubmissionNotEligibleError,
} from "../../../packages/modules/projects/src/infrastructure/pg-submission-commands.ts";
import { AuthorizationDeniedError } from "../../../packages/platform/auth/src/policy.ts";
import type { PrincipalRequest } from "./principal-middleware.ts";
import { authorizeRequest } from "./request-authorization.ts";
import { RequestConflictError } from "./api-errors.ts";
import { PRACTICE_SUBMISSION_COMMANDS, PROJECT_SUBMISSION_COMMANDS } from "./tokens.ts";

@Controller("learner/submissions")
export class LearnerSubmissionController {
  private readonly practice: PgPracticeSubmissionCommands;
  private readonly projects: PgProjectSubmissionCommands;

  constructor(
    @Inject(PRACTICE_SUBMISSION_COMMANDS) practice: PgPracticeSubmissionCommands,
    @Inject(PROJECT_SUBMISSION_COMMANDS) projects: PgProjectSubmissionCommands,
  ) {
    this.practice = practice;
    this.projects = projects;
  }

  @Post("practice")
  @HttpCode(202)
  async submitPractice(@Req() request: PrincipalRequest, @Body() rawBody: unknown) {
    const principal = this.requireLearner(request);
    const input = practiceSubmissionRequestSchema.parse(rawBody);
    authorizeRequest(request, "submission:create", { tenantId: principal.tenantId, ownerMemberId: principal.memberId });
    try {
      const queued = await this.practice.submit({
        tenantId: principal.tenantId,
        learnerId: principal.memberId,
        practiceRevisionId: input.practiceRevisionId,
        requestId: input.requestId,
        artifact: input.artifact,
      });
      return submissionQueuedResponseSchema.parse({
        submissionId: queued.submissionId,
        verificationRequestId: queued.verificationRequestId,
        status: "QUEUED",
        queuedAt: queued.queuedAt.toISOString(),
        idempotent: queued.idempotent,
      });
    } catch (error) {
      if (error instanceof PracticeSubmissionNotEligibleError) throw new AuthorizationDeniedError("learner is not assigned to this practice");
      if (error instanceof PracticeSubmissionConflictError) throw new RequestConflictError();
      throw error;
    }
  }

  @Post("project")
  @HttpCode(202)
  async submitProject(@Req() request: PrincipalRequest, @Body() rawBody: unknown) {
    const principal = this.requireLearner(request);
    const input = projectSubmissionRequestSchema.parse(rawBody);
    authorizeRequest(request, "submission:create", { tenantId: principal.tenantId, ownerMemberId: principal.memberId });
    try {
      const queued = await this.projects.submit({
        tenantId: principal.tenantId,
        learnerId: principal.memberId,
        artifactRevisionId: input.artifactRevisionId,
        requestId: input.requestId,
      });
      return submissionQueuedResponseSchema.parse({
        submissionId: queued.submissionId,
        verificationRequestId: queued.verificationRequestId,
        status: "QUEUED",
        queuedAt: queued.queuedAt.toISOString(),
        idempotent: queued.idempotent,
      });
    } catch (error) {
      if (error instanceof ProjectSubmissionNotEligibleError) throw new AuthorizationDeniedError("learner is not assigned to this project artifact");
      if (error instanceof ProjectSubmissionConflictError) throw new RequestConflictError();
      throw error;
    }
  }

  private requireLearner(request: PrincipalRequest) {
    const principal = request.principal;
    if (!principal || principal.kind !== "human" || !principal.roles.includes("LEARNER")) {
      throw new AuthorizationDeniedError("learner role required");
    }
    return principal;
  }
}
