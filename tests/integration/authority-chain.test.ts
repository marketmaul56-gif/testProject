import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { PgCompetencyAuthority } from "../../packages/modules/competency/src/infrastructure/pg-authority.ts";
import { VerificationDispatcherService, type VerifierExecutor } from "../../packages/modules/verification/src/application/authority.ts";
import { PgVerificationAuthority } from "../../packages/modules/verification/src/infrastructure/pg-authority.ts";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ids = {
  tenant: "00000000-0000-7000-8000-000000000001",
  learner: "00000000-0000-7000-8000-000000000010",
  skillA: "00000000-0000-7000-8000-000000000020",
  skillB: "00000000-0000-7000-8000-000000000021",
  skillC: "00000000-0000-7000-8000-000000000022",
  course: "00000000-0000-7000-8000-000000000030",
  courseVersion: "00000000-0000-7000-8000-000000000031",
  chapter: "00000000-0000-7000-8000-000000000032",
  lesson: "00000000-0000-7000-8000-000000000033",
  practiceA: "00000000-0000-7000-8000-000000000040",
  practiceRevA: "00000000-0000-7000-8000-000000000041",
  submissionA: "00000000-0000-7000-8000-000000000042",
  practiceB: "00000000-0000-7000-8000-000000000043",
  practiceRevB: "00000000-0000-7000-8000-000000000044",
  submissionB: "00000000-0000-7000-8000-000000000045",
  submissionError: "00000000-0000-7000-8000-000000000046",
  submissionFailed: "00000000-0000-7000-8000-000000000047",
  project: "00000000-0000-7000-8000-000000000050",
  artifact: "00000000-0000-7000-8000-000000000051",
  artifactRevision: "00000000-0000-7000-8000-000000000052",
  projectSubmission: "00000000-0000-7000-8000-000000000053",
  projectSkillAlignment: "00000000-0000-7000-8000-000000000054",
};

before(async () => {
  await pool.query(`
    INSERT INTO tenants (id, slug) VALUES ('${ids.tenant}', 'authority-test');
    INSERT INTO members (id, tenant_id, auth_user_id, display_name)
      VALUES ('${ids.learner}', '${ids.tenant}', 'auth-authority-learner', 'Authority Learner');
    INSERT INTO skills (id, tenant_id, key, name) VALUES
      ('${ids.skillA}', '${ids.tenant}', 'skill-a', 'Skill A'),
      ('${ids.skillB}', '${ids.tenant}', 'skill-b', 'Skill B'),
      ('${ids.skillC}', '${ids.tenant}', 'skill-c', 'Skill C');
    INSERT INTO courses (id, tenant_id, key) VALUES ('${ids.course}', '${ids.tenant}', 'authority-course');
    INSERT INTO course_versions (id, tenant_id, course_id, version, status, title, published_at)
      VALUES ('${ids.courseVersion}', '${ids.tenant}', '${ids.course}', 1, 'PUBLISHED', 'Authority Course', now());
    INSERT INTO chapter_versions (id, tenant_id, course_version_id, position, title)
      VALUES ('${ids.chapter}', '${ids.tenant}', '${ids.courseVersion}', 0, 'Chapter');
    INSERT INTO lesson_versions (id, tenant_id, chapter_version_id, position, title, content)
      VALUES ('${ids.lesson}', '${ids.tenant}', '${ids.chapter}', 0, 'Lesson', '{}'::jsonb);
    INSERT INTO practice_definitions (id, tenant_id, lesson_version_id, key) VALUES
      ('${ids.practiceA}', '${ids.tenant}', '${ids.lesson}', 'practice-a'),
      ('${ids.practiceB}', '${ids.tenant}', '${ids.lesson}', 'practice-b');
    INSERT INTO practice_revisions (id, tenant_id, practice_id, skill_id, revision_number, definition) VALUES
      ('${ids.practiceRevA}', '${ids.tenant}', '${ids.practiceA}', '${ids.skillA}', 1, '{}'::jsonb),
      ('${ids.practiceRevB}', '${ids.tenant}', '${ids.practiceB}', '${ids.skillB}', 1, '{}'::jsonb);
    INSERT INTO practice_submissions
      (id, tenant_id, learner_id, practice_revision_id, attempt_number, request_id, artifact) VALUES
      ('${ids.submissionA}', '${ids.tenant}', '${ids.learner}', '${ids.practiceRevA}', 1, 'sub-a', '{}'::jsonb),
      ('${ids.submissionB}', '${ids.tenant}', '${ids.learner}', '${ids.practiceRevB}', 1, 'sub-b', '{}'::jsonb),
      ('${ids.submissionError}', '${ids.tenant}', '${ids.learner}', '${ids.practiceRevA}', 2, 'sub-error', '{}'::jsonb),
      ('${ids.submissionFailed}', '${ids.tenant}', '${ids.learner}', '${ids.practiceRevA}', 3, 'sub-failed', '{}'::jsonb);
    INSERT INTO project_definitions (id, tenant_id, key, title)
      VALUES ('${ids.project}', '${ids.tenant}', 'project-a', 'Project A');
    INSERT INTO project_artifacts (id, tenant_id, learner_id, project_definition_id)
      VALUES ('${ids.artifact}', '${ids.tenant}', '${ids.learner}', '${ids.project}');
    INSERT INTO artifact_revisions
      (id, tenant_id, artifact_id, revision_number, object_key, content_hash, sealed_at)
      VALUES ('${ids.artifactRevision}', '${ids.tenant}', '${ids.artifact}', 1, 'authority/project/rev1', 'sha256:test', now());
    INSERT INTO project_submissions (id, tenant_id, learner_id, artifact_revision_id, request_id)
      VALUES ('${ids.projectSubmission}', '${ids.tenant}', '${ids.learner}', '${ids.artifactRevision}', 'project-sub-1');
    INSERT INTO project_skill_alignments (id, tenant_id, project_definition_id, skill_id)
      VALUES ('${ids.projectSkillAlignment}', '${ids.tenant}', '${ids.project}', '${ids.skillA}');
  `);
});

after(async () => { await pool.end(); });

function executor(outcome: "PASSED" | "FAILED", counter?: { calls: number }): VerifierExecutor {
  return {
    async execute() {
      if (counter) counter.calls += 1;
      return {
        outcome,
        diagnostic: { classification: "VERIFICATION", summaryCode: outcome === "PASSED" ? "ALL_CHECKS_PASS" : "CHECK_FAILED" },
      };
    },
  };
}

async function outboxForResult(resultId: string): Promise<string> {
  const result = await pool.query(
    `SELECT id FROM outbox_events WHERE event_type = 'verification.passed' AND aggregate_id = $1`,
    [resultId],
  );
  assert.equal(result.rowCount, 1);
  return String(result.rows[0].id);
}

test("practice PASS is retry-safe and produces exactly one evidence/projection effect", async () => {
  const counter = { calls: 0 };
  const repository = new PgVerificationAuthority(pool);
  const dispatcher = new VerificationDispatcherService(repository, executor("PASSED", counter));
  const request = {
    id: "00000000-0000-7000-8000-000000000060",
    requestId: "verify-practice-a",
    tenantId: ids.tenant,
    target: { kind: "PRACTICE" as const, submissionId: ids.submissionA },
    verifierKey: "typescript",
    verifierVersion: "v1",
    createdAt: new Date("2026-09-12T13:00:00Z"),
    artifactRef: "artifact://practice-a",
    hiddenTestBundleRef: "private://practice-a-tests",
  };
  const first = await dispatcher.verify(request);
  const retry = await dispatcher.verify({ ...request, id: "00000000-0000-7000-8000-000000000061" });
  assert.equal(first.outcome, "PASSED");
  assert.equal(retry.id, first.id);
  assert.equal(counter.calls, 1);
  const attempts = await pool.query(`SELECT count(*)::integer AS count FROM verification_attempts WHERE tenant_id=$1 AND request_id=$2`, [ids.tenant, request.requestId]);
  assert.equal(attempts.rows[0].count, 1);

  const eventId = await outboxForResult(first.id);
  const competency = new PgCompetencyAuthority(pool);
  const issued = await competency.processPassedVerificationEvent(eventId, new Date("2026-09-12T13:01:00Z"));
  const retried = await competency.processPassedVerificationEvent(eventId, new Date("2026-09-12T13:02:00Z"));
  assert.equal(issued.alreadyProcessed, false);
  assert.equal(retried.alreadyProcessed, true);
  const evidence = await pool.query(`SELECT count(*)::integer AS count FROM skill_evidence WHERE verification_result_id=$1 AND skill_id=$2`, [first.id, ids.skillA]);
  assert.equal(evidence.rows[0].count, 1);
  const projection = await pool.query(`SELECT status, evidence_count FROM competency_states WHERE tenant_id=$1 AND learner_id=$2 AND skill_id=$3`, [ids.tenant, ids.learner, ids.skillA]);
  assert.equal(projection.rows[0].status, "EVIDENCED");
  assert.equal(projection.rows[0].evidence_count, 1);
});

test("verifier outage is authoritative ERROR and never creates evidence", async () => {
  const repository = new PgVerificationAuthority(pool);
  const dispatcher = new VerificationDispatcherService(repository, { async execute() { throw new Error("verifier unavailable"); } });
  const result = await dispatcher.verify({
    id: "00000000-0000-7000-8000-000000000062",
    requestId: "verify-error",
    tenantId: ids.tenant,
    target: { kind: "PRACTICE", submissionId: ids.submissionError },
    verifierKey: "typescript",
    verifierVersion: "v1",
    createdAt: new Date("2026-09-12T13:03:00Z"),
    artifactRef: "artifact://error",
    hiddenTestBundleRef: "private://tests",
  });
  assert.equal(result.outcome, "ERROR");
  assert.equal(result.diagnostic.classification, "INFRASTRUCTURE");
  const outbox = await pool.query(`SELECT count(*)::integer AS count FROM outbox_events WHERE aggregate_id=$1 AND event_type='verification.passed'`, [result.id]);
  assert.equal(outbox.rows[0].count, 0);
  const evidence = await pool.query(`SELECT count(*)::integer AS count FROM skill_evidence WHERE verification_result_id=$1`, [result.id]);
  assert.equal(evidence.rows[0].count, 0);
});

test("evidence persistence failure leaves authority event unpublished and retry succeeds", async () => {
  const repository = new PgVerificationAuthority(pool);
  const dispatcher = new VerificationDispatcherService(repository, executor("PASSED"));
  const result = await dispatcher.verify({
    id: "00000000-0000-7000-8000-000000000063",
    requestId: "verify-practice-b",
    tenantId: ids.tenant,
    target: { kind: "PRACTICE", submissionId: ids.submissionB },
    verifierKey: "typescript",
    verifierVersion: "v1",
    createdAt: new Date("2026-09-12T13:04:00Z"),
    artifactRef: "artifact://practice-b",
    hiddenTestBundleRef: "private://practice-b-tests",
  });
  const eventId = await outboxForResult(result.id);
  await pool.query(`
    CREATE OR REPLACE FUNCTION test_fail_evidence_write() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'simulated evidence store failure'; END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER test_fail_evidence_write BEFORE INSERT ON skill_evidence
      FOR EACH ROW EXECUTE FUNCTION test_fail_evidence_write();
  `);
  const competency = new PgCompetencyAuthority(pool);
  await assert.rejects(() => competency.processPassedVerificationEvent(eventId, new Date("2026-09-12T13:05:00Z")), /simulated evidence store failure/);
  const eventAfterFailure = await pool.query(`SELECT published_at FROM outbox_events WHERE id=$1`, [eventId]);
  assert.equal(eventAfterFailure.rows[0].published_at, null);
  const falseProjection = await pool.query(`SELECT count(*)::integer AS count FROM competency_states WHERE tenant_id=$1 AND learner_id=$2 AND skill_id=$3`, [ids.tenant, ids.learner, ids.skillB]);
  assert.equal(falseProjection.rows[0].count, 0);
  await pool.query(`DROP TRIGGER test_fail_evidence_write ON skill_evidence; DROP FUNCTION test_fail_evidence_write();`);
  await competency.processPassedVerificationEvent(eventId, new Date("2026-09-12T13:06:00Z"));
  const projection = await pool.query(`SELECT status, evidence_count FROM competency_states WHERE tenant_id=$1 AND learner_id=$2 AND skill_id=$3`, [ids.tenant, ids.learner, ids.skillB]);
  assert.equal(projection.rows[0].status, "EVIDENCED");
  assert.equal(projection.rows[0].evidence_count, 1);
});

test("FAILED result cannot be converted into evidence and false competency writes are rejected", async () => {
  const repository = new PgVerificationAuthority(pool);
  const dispatcher = new VerificationDispatcherService(repository, executor("FAILED"));
  const failed = await dispatcher.verify({
    id: "00000000-0000-7000-8000-000000000064",
    requestId: "verify-failed",
    tenantId: ids.tenant,
    target: { kind: "PRACTICE", submissionId: ids.submissionFailed },
    verifierKey: "typescript",
    verifierVersion: "v1",
    createdAt: new Date("2026-09-12T13:07:00Z"),
    artifactRef: "artifact://failed",
    hiddenTestBundleRef: "private://tests",
  });
  assert.equal(failed.outcome, "FAILED");
  await assert.rejects(
    () => pool.query(
      `INSERT INTO skill_evidence (id, tenant_id, learner_id, skill_id, verification_result_id, issued_at)
       VALUES ('00000000-0000-7000-8000-000000000090',$1,$2,$3,$4,now())`,
      [ids.tenant, ids.learner, ids.skillA, failed.id],
    ),
    /requires PASSED authoritative verification/,
  );
  await assert.rejects(
    () => pool.query(
      `INSERT INTO competency_states (id, tenant_id, learner_id, skill_id, status, evidence_count, projected_at)
       VALUES ('00000000-0000-7000-8000-000000000091',$1,$2,$3,'EVIDENCED',99,now())`,
      [ids.tenant, ids.learner, ids.skillC],
    ),
    /derived deterministically from canonical evidence/,
  );
});

test("project PASS qualifies evidence only for explicitly aligned skill", async () => {
  const repository = new PgVerificationAuthority(pool);
  const dispatcher = new VerificationDispatcherService(repository, executor("PASSED"));
  const result = await dispatcher.verify({
    id: "00000000-0000-7000-8000-000000000065",
    requestId: "verify-project",
    tenantId: ids.tenant,
    target: { kind: "PROJECT", submissionId: ids.projectSubmission },
    verifierKey: "project-verifier",
    verifierVersion: "v1",
    createdAt: new Date("2026-09-12T13:08:00Z"),
    artifactRef: "artifact://project-revision",
    hiddenTestBundleRef: "private://project-tests",
  });
  const eventId = await outboxForResult(result.id);
  await new PgCompetencyAuthority(pool).processPassedVerificationEvent(eventId, new Date("2026-09-12T13:09:00Z"));
  const aligned = await pool.query(`SELECT count(*)::integer AS count FROM skill_evidence WHERE verification_result_id=$1 AND skill_id=$2`, [result.id, ids.skillA]);
  assert.equal(aligned.rows[0].count, 1);
  await assert.rejects(
    () => pool.query(
      `INSERT INTO skill_evidence (id, tenant_id, learner_id, skill_id, verification_result_id, issued_at)
       VALUES ('00000000-0000-7000-8000-000000000092',$1,$2,$3,$4,now())`,
      [ids.tenant, ids.learner, ids.skillC, result.id],
    ),
    /project evidence skill must be explicitly aligned/,
  );
});
