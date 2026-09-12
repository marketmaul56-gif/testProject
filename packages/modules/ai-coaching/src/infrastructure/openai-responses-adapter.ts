import { z } from "zod";
import {
  AiProviderTimeoutError,
  AiProviderUnavailableError,
  coachingDraftSchema,
  type AiCoachingProvider,
  type CoachingProviderInput,
} from "../application/provider.ts";

const responseEnvelopeSchema = z.object({
  id: z.string(),
  model: z.string(),
  status: z.string(),
  output_text: z.string().optional(),
  output: z.array(z.object({
    content: z.array(z.object({
      type: z.string(),
      text: z.string().optional(),
    }).passthrough()).optional(),
  }).passthrough()).optional(),
}).passthrough();

function extractOutputText(response: z.infer<typeof responseEnvelopeSchema>): string {
  if (response.output_text?.trim()) return response.output_text;
  for (const item of response.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text?.trim()) return part.text;
    }
  }
  throw new AiProviderUnavailableError("AI provider returned no structured text output");
}

const structuredOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message", "followUpQuestion"],
  properties: {
    message: { type: "string", minLength: 1, maxLength: 4000 },
    followUpQuestion: {
      anyOf: [
        { type: "string", minLength: 1, maxLength: 1000 },
        { type: "null" },
      ],
    },
  },
} as const;

export class OpenAiResponsesAdapter implements AiCoachingProvider {
  readonly modelProfile: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.modelProfile = `openai:${model}`;
  }

  async generate(input: CoachingProviderInput) {
    const body = {
      model: this.model,
      instructions: input.instructions,
      input: input.untrustedContext,
      store: false,
      tools: [],
      max_output_tokens: 800,
      text: {
        format: {
          type: "json_schema",
          name: "coaching_response",
          strict: true,
          schema: structuredOutputSchema,
        },
      },
    };

    let response: Response;
    try {
      response = await this.fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new AiProviderTimeoutError();
      }
      throw new AiProviderUnavailableError();
    }

    if (!response.ok) throw new AiProviderUnavailableError(`AI provider HTTP ${response.status}`);

    try {
      const envelope = responseEnvelopeSchema.parse(await response.json());
      if (envelope.status !== "completed") throw new AiProviderUnavailableError(`AI provider status ${envelope.status}`);
      const rawText = extractOutputText(envelope);
      return coachingDraftSchema.parse(JSON.parse(rawText));
    } catch (error) {
      if (error instanceof AiProviderUnavailableError) throw error;
      throw new AiProviderUnavailableError("AI provider returned an invalid structured response");
    }
  }
}
