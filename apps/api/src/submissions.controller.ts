import { Body, Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import type { PrincipalRequest } from "./principal-middleware.ts";
import { LEARNER_SUBMISSION_APPLICATION } from "./tokens.ts";
import { LearnerSubmissionApplication } from "./learner-submission-application.ts";

@Controller("learner/submissions")
export class LearnerSubmissionController {
  private readonly application: LearnerSubmissionApplication;

  constructor(@Inject(LEARNER_SUBMISSION_APPLICATION) application: LearnerSubmissionApplication) {
    this.application = application;
  }

  @Post("practice")
  @HttpCode(202)
  submitPractice(@Req() request: PrincipalRequest, @Body() rawBody: unknown) {
    return this.application.submitPractice(request.principal, rawBody);
  }

  @Post("project")
  @HttpCode(202)
  submitProject(@Req() request: PrincipalRequest, @Body() rawBody: unknown) {
    return this.application.submitProject(request.principal, rawBody);
  }
}
