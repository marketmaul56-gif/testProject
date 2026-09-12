import { z } from "zod";

export const coachingDraftSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  followUpQuestion: z.string().trim().min(1).max(1_000).nullable(),
}).strict();

export type CoachingDraft = z.infer<typeof coachingDraftSchema>;

export type CoachingProviderInput = Readonly<{
  instructions: string;
  untrustedContext: string;
  promptVersion: string;
}>;

export interface AiCoachingProvider {
  readonly modelProfile: string;
  generate(input: CoachingProviderInput): Promise<CoachingDraft>;
}

export class AiProviderUnavailableError extends Error {
  constructor(message = "AI coaching provider unavailable") {
    super(message);
    this.name = "AiProviderUnavailableError";
  }
}

export class AiProviderTimeoutError extends Error {
  constructor(message = "AI coaching provider timed out") {
    super(message);
    this.name = "AiProviderTimeoutError";
  }
}
