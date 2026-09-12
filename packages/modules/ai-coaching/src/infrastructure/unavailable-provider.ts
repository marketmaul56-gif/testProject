import {
  AiProviderUnavailableError,
  type AiCoachingProvider,
  type CoachingProviderInput,
} from "../application/provider.ts";

export class UnavailableAiCoachingProvider implements AiCoachingProvider {
  readonly modelProfile = "disabled";

  async generate(_input: CoachingProviderInput): Promise<never> {
    throw new AiProviderUnavailableError();
  }
}
