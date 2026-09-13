import { Body, Controller, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { z } from "zod";
import type { PrincipalRequest } from "./principal-middleware.ts";
import { LearnerProjectArtifactApplication } from "./project-artifact-application.ts";
import { LEARNER_PROJECT_ARTIFACT_APPLICATION } from "./tokens.ts";

const uuidSchema = z.string().uuid();

@Controller("learner")
export class LearnerProjectArtifactController {
  private readonly application: LearnerProjectArtifactApplication;

  constructor(@Inject(LEARNER_PROJECT_ARTIFACT_APPLICATION) application: LearnerProjectArtifactApplication) {
    this.application = application;
  }

  @Post("projects/:projectDefinitionId/artifacts/upload-intent")
  @HttpCode(201)
  createUploadIntent(
    @Req() request: PrincipalRequest,
    @Param("projectDefinitionId") projectDefinitionId: string,
    @Body() rawBody: unknown,
  ) {
    return this.application.createUploadIntent(request.principal, uuidSchema.parse(projectDefinitionId), rawBody);
  }

  @Post("artifacts/:artifactRevisionId/seal")
  @HttpCode(200)
  sealRevision(
    @Req() request: PrincipalRequest,
    @Param("artifactRevisionId") artifactRevisionId: string,
  ) {
    return this.application.sealRevision(request.principal, uuidSchema.parse(artifactRevisionId));
  }
}
