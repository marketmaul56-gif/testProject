import test from "node:test";
import assert from "node:assert/strict";
import { authorize } from "../../packages/platform/auth/src/policy.ts";
import type { HumanPrincipal, SystemPrincipal } from "../../packages/platform/auth/src/principal.ts";

const learner: HumanPrincipal = { kind: "human", authUserId: "auth-l", tenantId: "t-a", memberId: "learner-a", roles: ["LEARNER"] };
const instructor: HumanPrincipal = { kind: "human", authUserId: "auth-i", tenantId: "t-a", memberId: "instructor-a", roles: ["INSTRUCTOR"] };
const admin: HumanPrincipal = { kind: "human", authUserId: "auth-a", tenantId: "t-a", memberId: "admin-a", roles: ["PLATFORM_ADMIN"] };

test("cross-tenant access is denied before role evaluation", () => {
  assert.equal(authorize(admin, "cohort:manage", { tenantId: "t-b" }).allowed, false);
  assert.equal(authorize(learner, "submission:read", { tenantId: "t-b", ownerMemberId: "learner-a" }).allowed, false);
});

test("learner can access own resource but not another learner resource", () => {
  assert.equal(authorize(learner, "submission:read", { tenantId: "t-a", ownerMemberId: "learner-a" }).allowed, true);
  assert.equal(authorize(learner, "submission:read", { tenantId: "t-a", ownerMemberId: "learner-b" }).allowed, false);
});

test("instructor access requires explicit resource relationship", () => {
  assert.equal(authorize(instructor, "competency:read", { tenantId: "t-a", learnerMemberId: "learner-a", authorizedInstructorIds: ["instructor-a"] }).allowed, true);
  assert.equal(authorize(instructor, "competency:read", { tenantId: "t-a", learnerMemberId: "learner-a", authorizedInstructorIds: ["instructor-b"] }).allowed, false);
});

test("instructor can give guidance but cannot issue evidence", () => {
  const resource = { tenantId: "t-a", learnerMemberId: "learner-a", authorizedInstructorIds: ["instructor-a"] };
  assert.equal(authorize(instructor, "guidance:create", resource).allowed, true);
  assert.equal(authorize(instructor, "evidence:issue", resource).allowed, false);
});

test("platform admin remains outside evidence and competency authority", () => {
  assert.equal(authorize(admin, "cohort:manage", { tenantId: "t-a" }).allowed, true);
  assert.equal(authorize(admin, "evidence:issue", { tenantId: "t-a" }).allowed, false);
  assert.equal(authorize(admin, "competency:project", { tenantId: "t-a" }).allowed, false);
  assert.equal(authorize(admin, "verification:write", { tenantId: "t-a" }).allowed, false);
});

test("canonical system actors have narrow write authority", () => {
  const verifier: SystemPrincipal = { kind: "system", actor: "VERIFIER", tenantId: "t-a" };
  const issuer: SystemPrincipal = { kind: "system", actor: "EVIDENCE_ISSUER", tenantId: "t-a" };
  const projector: SystemPrincipal = { kind: "system", actor: "COMPETENCY_PROJECTOR", tenantId: "t-a" };
  assert.equal(authorize(verifier, "verification:write", { tenantId: "t-a" }).allowed, true);
  assert.equal(authorize(verifier, "evidence:issue", { tenantId: "t-a" }).allowed, false);
  assert.equal(authorize(issuer, "evidence:issue", { tenantId: "t-a" }).allowed, true);
  assert.equal(authorize(projector, "competency:project", { tenantId: "t-a" }).allowed, true);
});

test("system authority is also tenant scoped", () => {
  const verifier: SystemPrincipal = { kind: "system", actor: "VERIFIER", tenantId: "t-a" };
  assert.equal(authorize(verifier, "verification:write", { tenantId: "t-b" }).allowed, false);
});

test("unrelated resource action is denied by default", () => {
  assert.equal(authorize(learner, "cohort:manage", { tenantId: "t-a", ownerMemberId: "learner-a" }).allowed, false);
});
