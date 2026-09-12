import { type DynamicModule, Module } from "@nestjs/common";
import type { Pool } from "pg";
import { PgGuidanceWriter } from "../../../packages/modules/cohorts/src/infrastructure/pg-guidance-writer.ts";
import { ExperienceReadModel } from "../../../packages/platform/db/src/experience-read-model.ts";
import { InstructorExperienceController, LearnerExperienceController } from "./experience.controller.ts";
import { MeController } from "./me.controller.ts";
import { EXPERIENCE_READ_MODEL, GUIDANCE_WRITER } from "./tokens.ts";

@Module({})
export class AppModule {
  static forRoot(pool: Pool): DynamicModule {
    return {
      module: AppModule,
      controllers: [MeController, LearnerExperienceController, InstructorExperienceController],
      providers: [
        { provide: EXPERIENCE_READ_MODEL, useValue: new ExperienceReadModel(pool) },
        { provide: GUIDANCE_WRITER, useValue: new PgGuidanceWriter(pool) },
      ],
    };
  }
}
