import { z } from "zod";

const requestIdSchema = z.string().trim().min(8).max(128);
const artifactSchema = z.record(z.string(), z.unknown());

export const practiceSubmissionRequestSchema = z.object({
  practiceRevisionId: z.string().uuid(),
  requestId: requestIdSchema,
  artifact: artifactSchema,
}).strict();

export const projectSubmissionRequestSchema = z.object({
  artifactRevisionId: z.string().uuid(),
  requestId: requestIdSchema,
}).strict();

export const submissionQueuedResponseSchema = z.object({
  submissionId: z.string().uuid(),
  verificationRequestId: z.string().uuid(),
  status: z.literal("QUEUED"),
  queuedAt: z.string().datetime(),
  idempotent: z.boolean(),
}).strict();

export type PracticeSubmissionRequest = z.infer<typeof practiceSubmissionRequestSchema>;
export type ProjectSubmissionRequest = z.infer<typeof projectSubmissionRequestSchema>;
export type SubmissionQueuedResponse = z.infer<typeof submissionQueuedResponseSchema>;
