import assert from "node:assert/strict";
import test from "node:test";
import { coachingRequestSchema } from "@skill-platform/contracts/ai-coaching";
import { AiCoachingService } from "../../packages/modules/ai-coaching/src/application/coach.ts";
import { assembleMinimizedContext, serializeUntrustedContext } from "../../packages/modules/ai-coaching/src/application/context-assembler.ts";
import { AI_COACH_INSTRUCTIONS, AI_COACH_PROMPT_VERSION } from "../../packages/modules/ai-coaching/src/application/prompt-policy.ts";
import type { AiCoachingProvider, CoachingProviderInput } from "../../packages/modules/ai-coaching/src/application/provider.ts";
import type { AiCoachingTelemetry, AiCoachingTelemetryEvent } from "../../packages/modules/ai-coaching/src/application/telemetry.ts";
import { OpenAiResponsesAdapter } from "../../packages/modules/ai-coaching/src/infrastructure/openai-responses-adapter.ts";
import { UnavailableAiCoachingProvider } from "../../packages/modules/ai-coaching/src/infrastructure/unavailable-provider.ts";
import { authorize } from "../../packages/platform/auth/src/policy.ts";
import type { HumanPrincipal, SystemPrincipal } from "../../packages/platform/auth/src/principal.ts";

const request = {
  mode: "HINT",
  context: {
    kind: "PRACTICE",
    title: "Type narrowing",
    learnerVisiblePrompt: "Narrow unknown before reading a property.",
    learnerAttempt: "if (typeof value === 'string') { return value.length }",
  },
  question: "What should I inspect next?",
} as const;

class TelemetryCollector implements AiCoachingTelemetry {
  readonly events: AiCoachingTelemetryEvent[] = [];
  record(event: AiCoachingTelemetryEvent): void { this.events.push(event); }
}

class FakeProvider implements AiCoachingProvider {
  readonly modelProfile = "fake:test";
  lastInput: CoachingProviderInput | null = null;
  async generate(input: CoachingProviderInput) {
    this.lastInput = input;
    return { message: "Inspect the branch where the value is still unknown.", followUpQuestion: "What condition would narrow it?" };
  }
}

test("AI coaching request rejects hidden/verifier authority fields", () => {
  assert.throws(() => coachingRequestSchema.parse({
    ...request,
    context: { ...request.context, hiddenTests: ["secret"] },
  }));
  assert.throws(() => coachingRequestSchema.parse({ ...request, evidenceId: "forbidden" }));
});

test("context assembler includes only learner-visible minimized context", () => {
  const context = assembleMinimizedContext(coachingRequestSchema.parse(request));
  assert.deepEqual(Object.keys(context).sort(), ["kind", "learnerAttempt", "learnerVisiblePrompt", "mode", "question", "title"]);
  const serialized = serializeUntrustedContext(context);
  assert.match(serialized, /untrusted learner-visible context/i);
  assert.doesNotMatch(serialized, /hiddenTests|verifierSecret|answerKey/i);
});

test("prompt policy is explicitly formative and excludes competence authority", () => {
  assert.equal(AI_COACH_PROMPT_VERSION, "ai-coach-v1");
  assert.match(AI_COACH_INSTRUCTIONS, /formative/i);
  assert.match(AI_COACH_INSTRUCTIONS, /never decide PASS\/FAIL/i);
  assert.match(AI_COACH_INSTRUCTIONS, /never create or imply verified evidence/i);
  assert.match(AI_COACH_INSTRUCTIONS, /hidden tests/i);
  assert.match(AI_COACH_INSTRUCTIONS, /untrusted data/i);
});

test("AI coaching returns validated formative output and content-free telemetry", async () => {
  const provider = new FakeProvider();
  const telemetry = new TelemetryCollector();
  const service = new AiCoachingService(provider, telemetry);
  const response = await service.coach(request);
  assert.equal(response.status, "AVAILABLE");
  assert.equal(response.mode, "HINT");
  assert.equal("outcome" in response, false);
  assert.equal("evidence" in response, false);
  assert.equal("competency" in response, false);
  assert.equal(provider.lastInput?.promptVersion, AI_COACH_PROMPT_VERSION);
  assert.equal(telemetry.events.length, 1);
  assert.deepEqual(Object.keys(telemetry.events[0] ?? {}).sort(), ["latencyMs", "mode", "modelProfile", "promptVersion", "status"]);
});

test("AI outage degrades to UNAVAILABLE instead of blocking core flow", async () => {
  const telemetry = new TelemetryCollector();
  const service = new AiCoachingService(new UnavailableAiCoachingProvider(), telemetry);
  const response = await service.coach(request);
  assert.equal(response.status, "UNAVAILABLE");
  assert.equal(response.retryable, true);
  assert.match(response.message, /continue learning, practicing, submitting, and checking verification/i);
});

test("OpenAI Responses adapter sends store false, no tools, strict structured output", async () => {
  let calledUrl = "";
  let calledInit: RequestInit | undefined;
  const fakeFetch: typeof fetch = async (input, init) => {
    calledUrl = String(input);
    calledInit = init;
    return new Response(JSON.stringify({
      id: "resp_test",
      model: "test-model",
      status: "completed",
      output_text: JSON.stringify({ message: "Check the narrowing condition.", followUpQuestion: null }),
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const adapter = new OpenAiResponsesAdapter("test-key", "test-model", 5_000, fakeFetch);
  const result = await adapter.generate({
    instructions: AI_COACH_INSTRUCTIONS,
    untrustedContext: serializeUntrustedContext(assembleMinimizedContext(coachingRequestSchema.parse(request))),
    promptVersion: AI_COACH_PROMPT_VERSION,
  });
  assert.equal(result.message, "Check the narrowing condition.");
  assert.equal(result.followUpQuestion, null);
  assert.equal(calledUrl, "https://api.openai.com/v1/responses");
  const body = JSON.parse(String(calledInit?.body));
  assert.equal(body.store, false);
  assert.deepEqual(body.tools, []);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.deepEqual(body.text.format.schema.required, ["message", "followUpQuestion"]);
  assert.equal(body.input.includes("hiddenTests"), false);
});

test("AI capability is learner-own only and never a system authority capability", () => {
  const learner: HumanPrincipal = { kind: "human", authUserId: "auth-l", tenantId: "t-a", memberId: "learner-a", roles: ["LEARNER"] };
  const instructor: HumanPrincipal = { kind: "human", authUserId: "auth-i", tenantId: "t-a", memberId: "instructor-a", roles: ["INSTRUCTOR"] };
  const verifier: SystemPrincipal = { kind: "system", actor: "VERIFIER", tenantId: "t-a" };
  assert.equal(authorize(learner, "ai:coach", { tenantId: "t-a", ownerMemberId: "learner-a" }).allowed, true);
  assert.equal(authorize(learner, "ai:coach", { tenantId: "t-a", ownerMemberId: "learner-b" }).allowed, false);
  assert.equal(authorize(learner, "ai:coach", { tenantId: "t-b", ownerMemberId: "learner-a" }).allowed, false);
  assert.equal(authorize(instructor, "ai:coach", { tenantId: "t-a", authorizedInstructorIds: ["instructor-a"] }).allowed, false);
  assert.equal(authorize(verifier, "ai:coach", { tenantId: "t-a" }).allowed, false);
});
