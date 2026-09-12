import {
  practiceSubmissionRequestSchema,
  projectSubmissionRequestSchema,
  submissionQueuedResponseSchema,
  type SubmissionQueuedResponse,
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
import type { HumanPrincipal } from "../../../packages/platform/auth/src/principal.ts";
import { assertAuthorized, AuthorizationDeniedError } from "../../../packages/platform/auth/src/policy.ts";
import { RequestConflictError } from "./api-errors.ts";

export class LearnerSubmissionApplication {
  private readonly practice: PgPracticeSubmissionCommands;
  private readonly projects: PgProjectSubmissionCommands;

  constructor(practice: PgPracticeSubmissionCommands, projects: PgProjectSubmissionCommands) {
    this.practice = practice;
    this.projects = projects;
  }

  async submitPractice(principal: HumanPrincipal | undefined, rawBody: unknown): Promise<SubmissionQueuedResponse> {
    const learner = this.requireLearner(principal);
    const input = practiceSubmissionRequestSchema.parse(rawBody);
    assertAuthorized(learner, "submission:create", {
      tenantId: learner.tenantId,
      ownerMemberId: learner.memberId,
    });
    try {
      const queued = await this.practice.submit({
        tenantId: learner.tenantId,
        learnerId: learner.memberId,
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
      if (error instanceof PracticeSubmissionNotEligibleError) {
        throw new AuthorizationDeniedError("learner is not assigned to this practice");
      }
      if (error instanceof PracticeSubmissionConflictError) throw new RequestConflictError();
      throw error;
    }
  }

  async submitProject(principal: HumanPrincipal | undefined, rawBody: unknown): Promise<SubmissionQueuedResponse> {
    const learner = this.requireLearner(principal);
    const input = projectSubmissionRequestSchema.parse(rawBody);
    assertAuthorized(learner, "submission:create", {
      tenantId: learner.tenantId,
      ownerMemberId: learner.memberId,
    });
    try {
      const queued = await this.projects.submit({
        tenantId: learner.tenantId,
        learnerId: learner.memberId,
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
      if (error instanceof ProjectSubmissionNotEligibleError) {
        throw new AuthorizationDeniedError("learner is not assigned to this project artifact");
      }
      if (error instanceof ProjectSubmissionConflictError) throw new RequestConflictError();
      throw error;
    }
  }

  private requireLearner(principal: HumanPrincipal | undefined): HumanPrincipal {
    if (!principal || !principal.roles.includes("LEARNER")) {
      throw new AuthorizationDeniedError("learner role required");
    }
    return principal;
  }
}
