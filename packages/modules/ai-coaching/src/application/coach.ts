import {
  coachingRequestSchema,
  coachingResponseSchema,
  type CoachingRequest,
  type CoachingResponse,
} from "@skill-platform/contracts/ai-coaching";
import { assembleMinimizedContext, serializeUntrustedContext } from "./context-assembler.ts";
import { AI_COACH_INSTRUCTIONS, AI_COACH_PROMPT_VERSION } from "./prompt-policy.ts";
import {
  AiProviderTimeoutError,
  AiProviderUnavailableError,
  type AiCoachingProvider,
} from "./provider.ts";
import type { AiCoachingTelemetry } from "./telemetry.ts";

export class AiCoachingService {
  private readonly provider: AiCoachingProvider;
  private readonly telemetry: AiCoachingTelemetry;

  constructor(provider: AiCoachingProvider, telemetry: AiCoachingTelemetry) {
    this.provider = provider;
    this.telemetry = telemetry;
  }

  async coach(rawRequest: unknown): Promise<CoachingResponse> {
    const request: CoachingRequest = coachingRequestSchema.parse(rawRequest);
    const context = assembleMinimizedContext(request);
    const startedAt = Date.now();

    try {
      const draft = await this.provider.generate({
        instructions: AI_COACH_INSTRUCTIONS,
        untrustedContext: serializeUntrustedContext(context),
        promptVersion: AI_COACH_PROMPT_VERSION,
      });
      const response = coachingResponseSchema.parse({
        status: "AVAILABLE",
        mode: request.mode,
        message: draft.message,
        ...(draft.followUpQuestion ? { followUpQuestion: draft.followUpQuestion } : {}),
        promptVersion: AI_COACH_PROMPT_VERSION,
        modelProfile: this.provider.modelProfile,
      });
      this.telemetry.record({
        mode: request.mode,
        status: "AVAILABLE",
        latencyMs: Math.max(0, Date.now() - startedAt),
        modelProfile: this.provider.modelProfile,
        promptVersion: AI_COACH_PROMPT_VERSION,
      });
      return response;
    } catch (error) {
      const retryable = error instanceof AiProviderUnavailableError || error instanceof AiProviderTimeoutError;
      this.telemetry.record({
        mode: request.mode,
        status: "UNAVAILABLE",
        latencyMs: Math.max(0, Date.now() - startedAt),
        modelProfile: this.provider.modelProfile,
        promptVersion: AI_COACH_PROMPT_VERSION,
      });
      return coachingResponseSchema.parse({
        status: "UNAVAILABLE",
        mode: request.mode,
        message: "AI Coach is temporarily unavailable. You can continue learning, practicing, submitting, and checking verification without it.",
        retryable,
      });
    }
  }
}
