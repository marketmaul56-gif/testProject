import { z } from "zod";

export const coachingModeSchema = z.enum([
  "HINT",
  "DIAGNOSIS",
  "FEEDBACK",
  "GUIDING_QUESTION",
  "EXPLANATION",
]);

export const coachingContextSchema = z.object({
  kind: z.enum(["LESSON", "PRACTICE", "PROJECT"]),
  title: z.string().trim().min(1).max(200),
  learnerVisiblePrompt: z.string().trim().min(1).max(4_000),
  learnerAttempt: z.string().trim().max(8_000).optional(),
}).strict();

export const coachingRequestSchema = z.object({
  mode: coachingModeSchema,
  context: coachingContextSchema,
  question: z.string().trim().min(1).max(2_000),
}).strict();

export const coachingAvailableResponseSchema = z.object({
  status: z.literal("AVAILABLE"),
  mode: coachingModeSchema,
  message: z.string().min(1).max(4_000),
  followUpQuestion: z.string().min(1).max(1_000).optional(),
  promptVersion: z.string().min(1).max(100),
  modelProfile: z.string().min(1).max(100),
}).strict();

export const coachingUnavailableResponseSchema = z.object({
  status: z.literal("UNAVAILABLE"),
  mode: coachingModeSchema,
  message: z.string().min(1).max(1_000),
  retryable: z.boolean(),
}).strict();

export const coachingResponseSchema = z.discriminatedUnion("status", [
  coachingAvailableResponseSchema,
  coachingUnavailableResponseSchema,
]);

export type CoachingMode = z.infer<typeof coachingModeSchema>;
export type CoachingRequest = z.infer<typeof coachingRequestSchema>;
export type CoachingResponse = z.infer<typeof coachingResponseSchema>;
