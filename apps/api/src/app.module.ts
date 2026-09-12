import { type DynamicModule, Module } from "@nestjs/common";
import type { Pool } from "pg";
import { AiCoachingService } from "../../../packages/modules/ai-coaching/src/application/coach.ts";
import { ConsoleAiCoachingTelemetry } from "../../../packages/modules/ai-coaching/src/application/telemetry.ts";
import { OpenAiResponsesAdapter } from "../../../packages/modules/ai-coaching/src/infrastructure/openai-responses-adapter.ts";
import { UnavailableAiCoachingProvider } from "../../../packages/modules/ai-coaching/src/infrastructure/unavailable-provider.ts";
import { PgGuidanceWriter } from "../../../packages/modules/cohorts/src/infrastructure/pg-guidance-writer.ts";
import type { RuntimeConfig } from "../../../packages/platform/config/src/config.ts";
import { ExperienceReadModel } from "../../../packages/platform/db/src/experience-read-model.ts";
import { AiCoachingController } from "./ai-coaching.controller.ts";
import { InstructorExperienceController, LearnerExperienceController } from "./experience.controller.ts";
import { MeController } from "./me.controller.ts";
import { AI_COACHING_SERVICE, EXPERIENCE_READ_MODEL, GUIDANCE_WRITER } from "./tokens.ts";

@Module({})
export class AppModule {
  static forRoot(pool: Pool, aiConfig: RuntimeConfig["ai"]): DynamicModule {
    const aiProvider = aiConfig.enabled && aiConfig.apiKey && aiConfig.model
      ? new OpenAiResponsesAdapter(aiConfig.apiKey, aiConfig.model, aiConfig.timeoutMs)
      : new UnavailableAiCoachingProvider();
    const aiCoachingService = new AiCoachingService(aiProvider, new ConsoleAiCoachingTelemetry());

    return {
      module: AppModule,
      controllers: [
        MeController,
        LearnerExperienceController,
        InstructorExperienceController,
        AiCoachingController,
      ],
      providers: [
        { provide: EXPERIENCE_READ_MODEL, useValue: new ExperienceReadModel(pool) },
        { provide: GUIDANCE_WRITER, useValue: new PgGuidanceWriter(pool) },
        { provide: AI_COACHING_SERVICE, useValue: aiCoachingService },
      ],
    };
  }
}
