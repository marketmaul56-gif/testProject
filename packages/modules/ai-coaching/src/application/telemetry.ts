import type { CoachingMode } from "@skill-platform/contracts/ai-coaching";

export type AiCoachingTelemetryEvent = Readonly<{
  mode: CoachingMode;
  status: "AVAILABLE" | "UNAVAILABLE";
  latencyMs: number;
  modelProfile: string;
  promptVersion: string;
}>;

export interface AiCoachingTelemetry {
  record(event: AiCoachingTelemetryEvent): void;
}

export class ConsoleAiCoachingTelemetry implements AiCoachingTelemetry {
  record(event: AiCoachingTelemetryEvent): void {
    // Do not log learner prompts, attempts, model output, credentials, or verifier data.
    console.info(JSON.stringify({ event: "ai_coaching", ...event }));
  }
}
