import test from "node:test";
import assert from "node:assert/strict";
import { assertSameTenant } from "../../packages/modules/identity/src/domain/tenant.ts";
import { publishLearningVersion, assertLearningVersionMutable } from "../../packages/modules/learning/src/domain/publication.ts";
import { nextAttemptNumber } from "../../packages/modules/practice/src/domain/submission.ts";
import { sealArtifactRevision, assertArtifactRevisionMutable } from "../../packages/modules/projects/src/domain/artifact-revision.ts";
import { transitionCohort, removeMembership } from "../../packages/modules/cohorts/src/domain/lifecycle.ts";

test("cross-tenant references are rejected", () => {
  assert.doesNotThrow(() => assertSameTenant("tenant-a", "tenant-a"));
  assert.throws(() => assertSameTenant("tenant-a", "tenant-b"));
});

test("published learning versions become immutable", () => {
  const published = publishLearningVersion({ id: "v", tenantId: "t", version: 1, status: "DRAFT", publishedAt: null }, "2026-09-12T00:00:00Z");
  assert.equal(published.status, "PUBLISHED");
  assert.throws(() => assertLearningVersionMutable(published));
});

test("attempt numbers are server-derived and monotonic", () => {
  assert.equal(nextAttemptNumber([]), 1);
  assert.equal(nextAttemptNumber([1, 2]), 3);
});

test("sealed artifact revisions are immutable", () => {
  const sealed = sealArtifactRevision({ id: "r", artifactId: "a", revisionNumber: 1, sealedAt: null }, "2026-09-12T00:00:00Z");
  assert.throws(() => assertArtifactRevisionMutable(sealed));
});

test("cohort lifecycle has no normal backward transition", () => {
  assert.equal(transitionCohort("DRAFT", "ACTIVE"), "ACTIVE");
  assert.equal(transitionCohort("ACTIVE", "COMPLETED"), "COMPLETED");
  assert.equal(transitionCohort("COMPLETED", "ARCHIVED"), "ARCHIVED");
  assert.throws(() => transitionCohort("ACTIVE", "DRAFT"));
  assert.throws(() => transitionCohort("ARCHIVED", "ACTIVE"));
});

test("membership removal is historical and one-way", () => {
  assert.equal(removeMembership("ENROLLED"), "REMOVED");
  assert.throws(() => removeMembership("REMOVED"));
});
