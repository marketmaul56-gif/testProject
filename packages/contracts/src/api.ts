import { z } from "zod";

export const tenantHeaderSchema = z.string().uuid();

export const practiceSubmissionRequestSchema = z.object({
  requestId: z.string().min(1).max(128),
  practiceRevisionId: z.string().uuid(),
  artifact: z.record(z.string(), z.unknown()),
}).strict();

export const projectSubmissionRequestSchema = z.object({
  requestId: z.string().min(1).max(128),
  artifactRevisionId: z.string().uuid(),
}).strict();
