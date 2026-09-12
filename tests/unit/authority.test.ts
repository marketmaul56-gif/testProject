import test from "node:test";
import assert from "node:assert/strict";
import { isInfrastructureFailure, isLearnerFailure } from "../../packages/modules/verification/src/domain/result.ts";
import { issueEvidenceFromVerification, evidenceUniquenessKey } from "../../packages/modules/competency/src/domain/evidence.ts";
import { projectCompetency } from "../../packages/modules/competency/src/domain/projection.ts";

test("verification ERROR is infrastructure failure, never learner failure", () => {
  assert.equal(isInfrastructureFailure("ERROR"), true);
  assert.equal(isLearnerFailure("ERROR"), false);
});

test("FAILED is learner failure but cannot create evidence", () => {
  assert.equal(isLearnerFailure("FAILED"), true);
  assert.throws(() => issueEvidenceFromVerification({
    id: "vr-1", tenantId: "t-1", learnerId: "u-1", status: "FAILED",
    verifierKey: "code-v1", verifierVersion: "sha256:abc", completedAt: "2026-09-12T00:00:00Z",
  }, { evidenceId: "e-1", skillId: "s-1", issuedAt: "2026-09-12T00:00:01Z" }));
});

test("PASSED verification can create evidence with immutable provenance", () => {
  const evidence = issueEvidenceFromVerification({
    id: "vr-1", tenantId: "t-1", learnerId: "u-1", status: "PASSED",
    verifierKey: "code-v1", verifierVersion: "sha256:abc", completedAt: "2026-09-12T00:00:00Z",
  }, { evidenceId: "e-1", skillId: "s-1", issuedAt: "2026-09-12T00:00:01Z" });
  assert.equal(evidence.verificationResultId, "vr-1");
  assert.equal(evidence.verifierVersion, "sha256:abc");
  assert.equal(projectCompetency("s-1", [evidence]), "EVIDENCED");
});

test("absence of evidence is NOT_YET_EVIDENCED, not learner failure", () => {
  assert.equal(projectCompetency("s-1", []), "NOT_YET_EVIDENCED");
});

test("evidence uniqueness key is deterministic for retry safety", () => {
  assert.equal(
    evidenceUniquenessKey("t", "vr", "skill"),
    evidenceUniquenessKey("t", "vr", "skill"),
  );
});
