import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { authorizeRequest } from "../../apps/api/src/request-authorization.ts";
import { problemFor } from "../../apps/api/src/problem-details.ts";
import type { PrincipalRequest } from "../../apps/api/src/principal-middleware.ts";
import { AuthenticationRequiredError } from "../../packages/platform/auth/src/principal.ts";
import { AuthorizationDeniedError } from "../../packages/platform/auth/src/policy.ts";

function requestWithPrincipal(principal?: PrincipalRequest["principal"]): PrincipalRequest {
  return { principal } as PrincipalRequest;
}

test("API authorization boundary rejects missing authenticated principal", () => {
  assert.throws(
    () => authorizeRequest(requestWithPrincipal(), "submission:read", { tenantId: "t-a", ownerMemberId: "learner-a" }),
    AuthenticationRequiredError,
  );
});

test("API authorization boundary rejects cross-tenant object access", () => {
  const request = requestWithPrincipal({
    kind: "human",
    authUserId: "auth-l",
    tenantId: "t-a",
    memberId: "learner-a",
    roles: ["LEARNER"],
  });
  assert.throws(
    () => authorizeRequest(request, "submission:read", { tenantId: "t-b", ownerMemberId: "learner-a" }),
    AuthorizationDeniedError,
  );
});

test("API authorization boundary allows learner access only to related object", () => {
  const request = requestWithPrincipal({
    kind: "human",
    authUserId: "auth-l",
    tenantId: "t-a",
    memberId: "learner-a",
    roles: ["LEARNER"],
  });
  assert.doesNotThrow(() => authorizeRequest(request, "submission:read", { tenantId: "t-a", ownerMemberId: "learner-a" }));
  assert.throws(
    () => authorizeRequest(request, "submission:read", { tenantId: "t-a", ownerMemberId: "learner-b" }),
    AuthorizationDeniedError,
  );
});

test("validation errors become safe 400 problem details without schema internals", () => {
  const error = z.string().uuid().safeParse("attacker-controlled-invalid-id");
  assert.equal(error.success, false);
  if (error.success) return;
  const problem = problemFor(error.error);
  assert.equal(problem.status, 400);
  assert.equal(problem.type, "urn:problem:validation");
  assert.equal(problem.detail, "The request did not satisfy the API contract.");
  assert.equal(JSON.stringify(problem).includes("attacker-controlled-invalid-id"), false);
});
