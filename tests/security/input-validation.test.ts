import test from "node:test";
import assert from "node:assert/strict";
import { practiceSubmissionRequestSchema, projectSubmissionRequestSchema } from "../../packages/contracts/src/api.ts";

test("practice submission rejects client-controlled authority fields", () => {
  const result = practiceSubmissionRequestSchema.safeParse({
    requestId: "req-1",
    practiceRevisionId: "019946f0-3b33-7c8f-8b1f-8b9af8ab31df",
    artifact: { source: "const x = 1" },
    tenantId: "attacker-tenant",
    learnerId: "another-user",
    verificationStatus: "PASSED",
    role: "PLATFORM_ADMIN",
  });
  assert.equal(result.success, false);
});

test("project submission rejects client-controlled learner identity", () => {
  const result = projectSubmissionRequestSchema.safeParse({
    requestId: "req-2",
    artifactRevisionId: "019946f0-3b33-7c8f-8b1f-8b9af8ab31df",
    learnerId: "another-user",
  });
  assert.equal(result.success, false);
});
