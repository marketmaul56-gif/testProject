import { z } from "zod";
import type {
  VerifierExecutionRequest,
  VerifierExecutionResult,
  VerifierExecutor,
} from "../../../packages/modules/verification/src/application/authority.ts";

const responseSchema = z.object({
  outcome: z.enum(["PASSED", "FAILED"]),
  diagnostic: z.object({
    classification: z.literal("VERIFICATION"),
    summaryCode: z.string().min(1).max(100),
    passedChecks: z.number().int().min(0).optional(),
    totalChecks: z.number().int().min(0).optional(),
  }).strict(),
}).strict();

export class HttpVerifierExecutor implements VerifierExecutor {
  private readonly endpoint: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, token: string, timeoutMs = 20_000) {
    const url = new URL(baseUrl);
    this.endpoint = new URL("/internal/v1/verify", url).toString();
    if (token.length < 32) throw new Error("verifier dispatcher token must contain at least 32 characters");
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  async execute(request: VerifierExecutionRequest): Promise<VerifierExecutionResult> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-dispatcher-token": this.token,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await response.text();
    if (text.length > 64 * 1024) throw new Error("verifier dispatcher response exceeds safe limit");
    if (!response.ok) throw new Error(`verifier dispatcher unavailable (${response.status})`);

    const parsed = responseSchema.parse(JSON.parse(text));
    const diagnostic: VerifierExecutionResult["diagnostic"] = {
      classification: parsed.diagnostic.classification,
      summaryCode: parsed.diagnostic.summaryCode,
      ...(parsed.diagnostic.passedChecks === undefined ? {} : { passedChecks: parsed.diagnostic.passedChecks }),
      ...(parsed.diagnostic.totalChecks === undefined ? {} : { totalChecks: parsed.diagnostic.totalChecks }),
    };
    return Object.freeze({ outcome: parsed.outcome, diagnostic });
  }
}
