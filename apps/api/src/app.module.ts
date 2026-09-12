import { type DynamicModule, Module } from "@nestjs/common";
import type { Pool } from "pg";
import { AiCoachingService } from "../../../packages/modules/ai-coaching/src/application/coach.ts";
import { ConsoleAiCoachingTelemetry } from "../../../packages/modules/ai-coaching/src/application/telemetry.ts";
import { OpenAiResponsesAdapter } from "../../../packages/modules/ai-coaching/src/infrastructure/openai-responses-adapter.ts";
import { UnavailableAiCoachingProvider } from "../../../packages/modules/ai-coaching/src/infrastructure/unavailable-provider.ts";
import { PgGuidanceWriter } from "../../../packages/modules/cohorts/src/infrastructure/pg-guidance-writer.ts";
import { PgPracticeSubmissionCommands } from "../../../packages/modules/practice/src/infrastructure/pg-submission-commands.ts";
import { PgProjectArtifactCommands } from "../../../packages/modules/projects/src/infrastructure/pg-artifact-commands.ts";
import { PgProjectSubmissionCommands } from "../../../packages/modules/projects/src/infrastructure/pg-submission-commands.ts";
import type { RuntimeConfig } from "../../../packages/platform/config/src/config.ts";
import { ExperienceReadModel } from "../../../packages/platform/db/src/experience-read-model.ts";
import { S3ObjectStorage } from "../../../packages/platform/storage/src/s3-object-storage.ts";
import { AiCoachingController } from "./ai-coaching.controller.ts";
import { InstructorExperienceController, LearnerExperienceController } from "./experience.controller.ts";
import { LearnerSubmissionApplication } from "./learner-submission-application.ts";
import { MeController } from "./me.controller.ts";
import { LearnerProjectArtifactApplication } from "./project-artifact-application.ts";
import { LearnerProjectArtifactController } from "./project-artifacts.controller.ts";
import { LearnerSubmissionController } from "./submissions.controller.ts";
import {
  AI_COACHING_SERVICE,
  EXPERIENCE_READ_MODEL,
  GUIDANCE_WRITER,
  LEARNER_PROJECT_ARTIFACT_APPLICATION,
  LEARNER_SUBMISSION_APPLICATION,
  PRACTICE_SUBMISSION_COMMANDS,
  PROJECT_SUBMISSION_COMMANDS,
} from "./tokens.ts";

@Module({})
export class AppModule {
  static forRoot(pool: Pool, config: RuntimeConfig): DynamicModule {
    const aiConfig = config.ai;
    const aiProvider = aiConfig.enabled && aiConfig.apiKey && aiConfig.model
      ? new OpenAiResponsesAdapter(aiConfig.apiKey, aiConfig.model, aiConfig.timeoutMs)
      : new UnavailableAiCoachingProvider();
    const aiCoachingService = new AiCoachingService(aiProvider, new ConsoleAiCoachingTelemetry());
    const practiceSubmissionCommands = new PgPracticeSubmissionCommands(pool);
    const projectSubmissionCommands = new PgProjectSubmissionCommands(pool);
    const learnerSubmissionApplication = new LearnerSubmissionApplication(
      practiceSubmissionCommands,
      projectSubmissionCommands,
    );
    const projectArtifactCommands = new PgProjectArtifactCommands(pool);
    const objectStorage = config.storage ? new S3ObjectStorage(config.storage) : null;
    const learnerProjectArtifactApplication = new LearnerProjectArtifactApplication(projectArtifactCommands, objectStorage);

    return {
      module: AppModule,
      controllers: [
        MeController,
        LearnerExperienceController,
        InstructorExperienceController,
        AiCoachingController,
        LearnerProjectArtifactController,
        LearnerSubmissionController,
      ],
      providers: [
        { provide: EXPERIENCE_READ_MODEL, useValue: new ExperienceReadModel(pool) },
        { provide: GUIDANCE_WRITER, useValue: new PgGuidanceWriter(pool) },
        { provide: AI_COACHING_SERVICE, useValue: aiCoachingService },
        { provide: PRACTICE_SUBMISSION_COMMANDS, useValue: practiceSubmissionCommands },
        { provide: PROJECT_SUBMISSION_COMMANDS, useValue: projectSubmissionCommands },
        { provide: LEARNER_SUBMISSION_APPLICATION, useValue: learnerSubmissionApplication },
        { provide: LEARNER_PROJECT_ARTIFACT_APPLICATION, useValue: learnerProjectArtifactApplication },
      ],
    };
  }
}
