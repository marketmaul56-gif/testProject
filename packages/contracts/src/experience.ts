import { z } from "zod";

export const verificationUiStateSchema = z.enum([
  "NOT_SUBMITTED",
  "PENDING",
  "RUNNING",
  "PASSED",
  "FAILED",
  "SYSTEM_ERROR",
]);
export type VerificationUiState = z.infer<typeof verificationUiStateSchema>;

const competencyItemSchema = z.object({
  skillId: z.string().uuid(),
  skillName: z.string(),
  status: z.enum(["NOT_YET_EVIDENCED", "EVIDENCED"]),
  evidenceCount: z.number().int().nonnegative(),
  projectedAt: z.string().datetime(),
});

const evidenceItemSchema = z.object({
  evidenceId: z.string().uuid(),
  skillId: z.string().uuid(),
  skillName: z.string(),
  verificationResultId: z.string().uuid(),
  issuedAt: z.string().datetime(),
});

const practiceItemSchema = z.object({
  practiceId: z.string().uuid(),
  practiceRevisionId: z.string().uuid(),
  key: z.string(),
  attemptNumber: z.number().int().positive().nullable(),
  submissionId: z.string().uuid().nullable(),
  verificationState: verificationUiStateSchema,
});

const lessonItemSchema = z.object({
  lessonVersionId: z.string().uuid(),
  title: z.string(),
  completionState: z.string().nullable(),
  practices: z.array(practiceItemSchema),
});

const projectItemSchema = z.object({
  projectDefinitionId: z.string().uuid(),
  title: z.string(),
  artifactRevisionId: z.string().uuid().nullable(),
  submissionId: z.string().uuid().nullable(),
  verificationState: verificationUiStateSchema,
});

const assignedCourseSchema = z.object({
  courseVersionId: z.string().uuid(),
  title: z.string(),
  lessons: z.array(lessonItemSchema),
  projects: z.array(projectItemSchema),
});

export const learnerOverviewSchema = z.object({
  learnerId: z.string().uuid(),
  assignedLearning: z.array(assignedCourseSchema),
  evidence: z.array(evidenceItemSchema),
  competencies: z.array(competencyItemSchema),
});
export type LearnerOverview = z.infer<typeof learnerOverviewSchema>;

const cohortSummarySchema = z.object({
  cohortId: z.string().uuid(),
  name: z.string(),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"]),
  primaryCourseTitle: z.string().nullable(),
  activeLearnerCount: z.number().int().nonnegative(),
});

export const instructorCohortsSchema = z.object({
  cohorts: z.array(cohortSummarySchema),
});
export type InstructorCohorts = z.infer<typeof instructorCohortsSchema>;

const rosterItemSchema = z.object({
  learnerId: z.string().uuid(),
  displayName: z.string().nullable(),
  completedLessons: z.number().int().nonnegative(),
  totalLessons: z.number().int().nonnegative(),
  submissionCount: z.number().int().nonnegative(),
  evidenceCount: z.number().int().nonnegative(),
});

export const instructorCohortOverviewSchema = z.object({
  cohort: cohortSummarySchema,
  roster: z.array(rosterItemSchema),
});
export type InstructorCohortOverview = z.infer<typeof instructorCohortOverviewSchema>;

export const instructorLearnerDetailSchema = z.object({
  learnerId: z.string().uuid(),
  displayName: z.string().nullable(),
  completedLessons: z.number().int().nonnegative(),
  totalLessons: z.number().int().nonnegative(),
  evidence: z.array(evidenceItemSchema),
  competencies: z.array(competencyItemSchema),
  guidance: z.array(z.object({
    guidanceId: z.string().uuid(),
    message: z.string(),
    createdAt: z.string().datetime(),
    instructorId: z.string().uuid(),
  })),
});
export type InstructorLearnerDetail = z.infer<typeof instructorLearnerDetailSchema>;

export const guidanceRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
}).strict();
export type GuidanceRequest = z.infer<typeof guidanceRequestSchema>;

export const guidanceResponseSchema = z.object({
  guidanceId: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type GuidanceResponse = z.infer<typeof guidanceResponseSchema>;
