import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { Pool } from "pg";
import { LearnerSubmissionController } from "../../apps/api/src/submissions.controller.ts";
import { AuthorityWorker } from "../../apps/worker/src/authority-worker.ts";
import { HttpVerifierExecutor } from "../../apps/worker/src/http-verifier-executor.ts";
import { createVerifierDispatcherServer } from "../../apps/verifier-dispatcher/src/server.ts";
import { PgCompetencyAuthority } from "../../packages/modules/competency/src/infrastructure/pg-authority.ts";
import { PgPracticeSubmissionCommands } from "../../packages/modules/practice/src/infrastructure/pg-submission-commands.ts";
import { PgProjectSubmissionCommands } from "../../packages/modules/projects/src/infrastructure/pg-submission-commands.ts";
import { VerificationDispatcherService, type VerifierExecutor } from "../../packages/modules/verification/src/application/authority.ts";
import { PgVerificationAuthority } from "../../packages/modules/verification/src/infrastructure/pg-authority.ts";
import { PgRuntimeVerificationQueue } from "../../packages/modules/verification/src/infrastructure/pg-runtime-queue.ts";
import { AuthorizationDeniedError } from "../../packages/platform/auth/src/policy.ts";
import type { PrincipalRequest } from "../../apps/api/src/principal-middleware.ts";

const ids = {
  tenant: "00000000-0000-7000-8000-000000000501",
  learner: "00000000-0000-7000-8000-000000000502",
  otherLearner: "00000000-0000-7000-8000-000000000503",
  course: "00000000-0000-7000-8000-000000000504",
  courseVersion: "00000000-0000-7000-8000-000000000505",
  chapter: "00000000-0000-7000-8000-000000000506",
  lesson: "00000000-0000-7000-8000-000000000507",
  skill: "00000000-0000-7000-8000-000000000508",
  practice: "00000000-0000-7000-8000-000000000509",
  practicePass: "00000000-0000-7000-8000-00000000050a",
  practiceError: "00000000-0000-7000-8000-00000000050b",
  practiceRetry: "00000000-0000-7000-8000-00000000050c",
  project: "00000000-0000-7000-8000-00000000050d",
  projectLearning: "00000000-0000-7000-8000-00000000050e",
  projectSkill: "00000000-0000-7000-8000-00000000050f",
  artifact: "00000000-0000-7000-8000-000000000510",
  artifactRevision: "00000000-0000-7000-8000-000000000511",
  enrollment: "00000000-0000-7000-8000-000000000512",
  profilePass: "00000000-0000-7000-8000-000000000513",
  profileError: "00000000-0000-7000-8000-000000000514",
  profileRetry: "00000000-0000-7000-8000-000000000515",
  profileProject: "00000000-0000-7000-8000-000000000516",
} as const;

const token = "runtime-test-dispatcher-token-0000000000000001";

function learnerRequest(memberId = ids.learner): PrincipalRequest {
  return {
    principal: {
      kind: "human",
      authUserId: `auth-${memberId}`,
      tenantId: ids.tenant,
      memberId,
      roles: ["LEARNER"],
    },
  } as unknown as PrincipalRequest;
}

const fakeSandboxExecutor: VerifierExecutor = {
  async execute(request) {
    if (request.verifierKey === "runtime-error") throw new Error("simulated isolated verifier infrastructure outage");
    return {
      outcome: "PASSED",
      diagnostic: {
        classification: "VERIFICATION",
        summaryCode: request.verifierKey === "project-runtime" ? "PROJECT_PASS" : "PRACTICE_PASS",
        passedChecks: 3,
        totalChecks: 3,
      },
    };
  },
};

async function counts(pool: Pool) {
  const result = await pool.query(`
    SELECT
      (SELECT count(*)::integer FROM practice_submissions WHERE tenant_id='${ids.tenant}') AS practice_submissions,
      (SELECT count(*)::integer FROM project_submissions WHERE tenant_id='${ids.tenant}') AS project_submissions,
      (SELECT count(*)::integer FROM verification_attempts WHERE tenant_id='${ids.tenant}') AS attempts,
      (SELECT count(*)::integer FROM verification_results WHERE tenant_id='${ids.tenant}') AS results,
      (SELECT count(*)::integer FROM skill_evidence WHERE tenant_id='${ids.tenant}') AS evidence,
      (SELECT count(*)::integer FROM competency_states WHERE tenant_id='${ids.tenant}') AS competencies
  `);
  return result.rows[0] as Record<string, number>;
}

test("production command -> worker -> dispatcher -> evidence runtime is idempotent, isolated, and retry safe", async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const server = createVerifierDispatcherServer(fakeSandboxExecutor, token);
  try {
    await pool.query(`
      INSERT INTO tenants (id, slug) VALUES ('${ids.tenant}', 'runtime-authority');
      INSERT INTO members (id, tenant_id, auth_user_id, display_name) VALUES
        ('${ids.learner}', '${ids.tenant}', 'runtime-learner', 'Runtime Learner'),
        ('${ids.otherLearner}', '${ids.tenant}', 'runtime-other', 'Other Learner');
      INSERT INTO member_roles (tenant_id, member_id, role) VALUES
        ('${ids.tenant}', '${ids.learner}', 'LEARNER'),
        ('${ids.tenant}', '${ids.otherLearner}', 'LEARNER');
      INSERT INTO courses (id, tenant_id, key)
        VALUES ('${ids.course}', '${ids.tenant}', 'runtime-course');
      INSERT INTO course_versions (id, tenant_id, course_id, version, status, title, published_at)
        VALUES ('${ids.courseVersion}', '${ids.tenant}', '${ids.course}', 1, 'PUBLISHED', 'Runtime Course', now());
      INSERT INTO chapter_versions (id, tenant_id, course_version_id, position, title)
        VALUES ('${ids.chapter}', '${ids.tenant}', '${ids.courseVersion}', 1, 'Runtime Chapter');
      INSERT INTO lesson_versions (id, tenant_id, chapter_version_id, position, title, content)
        VALUES ('${ids.lesson}', '${ids.tenant}', '${ids.chapter}', 1, 'Runtime Lesson', '{}'::jsonb);
      INSERT INTO skills (id, tenant_id, key, name)
        VALUES ('${ids.skill}', '${ids.tenant}', 'runtime-skill', 'Runtime Skill');
      INSERT INTO enrollments (id, tenant_id, learner_id, course_version_id)
        VALUES ('${ids.enrollment}', '${ids.tenant}', '${ids.learner}', '${ids.courseVersion}');
      INSERT INTO practice_definitions (id, tenant_id, lesson_version_id, key)
        VALUES ('${ids.practice}', '${ids.tenant}', '${ids.lesson}', 'runtime-practice');
      INSERT INTO practice_revisions (id, tenant_id, practice_id, skill_id, revision_number, definition) VALUES
        ('${ids.practicePass}', '${ids.tenant}', '${ids.practice}', '${ids.skill}', 1, '{}'::jsonb),
        ('${ids.practiceError}', '${ids.tenant}', '${ids.practice}', '${ids.skill}', 2, '{}'::jsonb),
        ('${ids.practiceRetry}', '${ids.tenant}', '${ids.practice}', '${ids.skill}', 3, '{}'::jsonb);
      INSERT INTO project_definitions (id, tenant_id, key, title)
        VALUES ('${ids.project}', '${ids.tenant}', 'runtime-project', 'Runtime Project');
      INSERT INTO project_learning_alignments (id, tenant_id, course_version_id, project_definition_id, position)
        VALUES ('${ids.projectLearning}', '${ids.tenant}', '${ids.courseVersion}', '${ids.project}', 1);
      INSERT INTO project_skill_alignments (id, tenant_id, project_definition_id, skill_id)
        VALUES ('${ids.projectSkill}', '${ids.tenant}', '${ids.project}', '${ids.skill}');
      INSERT INTO project_artifacts (id, tenant_id, learner_id, project_definition_id)
        VALUES ('${ids.artifact}', '${ids.tenant}', '${ids.learner}', '${ids.project}');
      INSERT INTO artifact_revisions
        (id, tenant_id, artifact_id, revision_number, object_key, content_hash, sealed_at)
        VALUES ('${ids.artifactRevision}', '${ids.tenant}', '${ids.artifact}', 1,
                'data:text/plain;base64,cHJvamVjdC1hbnN3ZXI=', 'sha256:runtime', now());
      INSERT INTO verification_profiles
        (id, tenant_id, target_type, target_id, verifier_key, verifier_version, hidden_test_bundle_ref) VALUES
        ('${ids.profilePass}', '${ids.tenant}', 'PRACTICE_REVISION', '${ids.practicePass}', 'practice-runtime', '1', 'file:///hidden/practice-pass'),
        ('${ids.profileError}', '${ids.tenant}', 'PRACTICE_REVISION', '${ids.practiceError}', 'runtime-error', '1', 'file:///hidden/practice-error'),
        ('${ids.profileRetry}', '${ids.tenant}', 'PRACTICE_REVISION', '${ids.practiceRetry}', 'practice-runtime', '1', 'file:///hidden/practice-retry'),
        ('${ids.profileProject}', '${ids.tenant}', 'PROJECT_DEFINITION', '${ids.project}', 'project-runtime', '1', 'file:///hidden/project-pass');
    `);

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const executor = new HttpVerifierExecutor(`http://127.0.0.1:${address.port}`, token, 5_000);
    const verification = new VerificationDispatcherService(new PgVerificationAuthority(pool), executor);
    const queue = new PgRuntimeVerificationQueue(pool);
    const controller = new LearnerSubmissionController(
      new PgPracticeSubmissionCommands(pool),
      new PgProjectSubmissionCommands(pool),
    );
    const realWorker = new AuthorityWorker(queue, verification, new PgCompetencyAuthority(pool));

    const practice = await controller.submitPractice(learnerRequest(), {
      practiceRevisionId: ids.practicePass,
      requestId: "runtime-practice-request-0001",
      artifact: { source: "export const answer = 42" },
    });
    assert.equal(practice.status, "QUEUED");
    assert.equal(practice.idempotent, false);
    assert.equal(JSON.stringify(practice).includes("hidden"), false);

    const duplicate = await controller.submitPractice(learnerRequest(), {
      practiceRevisionId: ids.practicePass,
      requestId: "runtime-practice-request-0001",
      artifact: { source: "export const answer = 42" },
    });
    assert.equal(duplicate.idempotent, true);
    assert.equal(duplicate.submissionId, practice.submissionId);
    assert.equal(duplicate.verificationRequestId, practice.verificationRequestId);

    const firstRun = await realWorker.runOnce();
    assert.equal(firstRun.verificationProcessed, 1);
    assert.equal(firstRun.verificationErrors, 0);
    assert.equal(firstRun.evidenceProcessed, 1);
    assert.deepEqual(await counts(pool), {
      practice_submissions: 1,
      project_submissions: 0,
      attempts: 1,
      results: 1,
      evidence: 1,
      competencies: 1,
    });

    const replay = await realWorker.runOnce();
    assert.deepEqual(replay, { verificationProcessed: 0, verificationErrors: 0, evidenceProcessed: 0, deliveryFailures: 0 });
    assert.equal((await counts(pool)).evidence, 1);

    const project = await controller.submitProject(learnerRequest(), {
      artifactRevisionId: ids.artifactRevision,
      requestId: "runtime-project-request-0001",
    });
    assert.equal(project.status, "QUEUED");
    assert.equal(JSON.stringify(project).includes("hidden"), false);
    const projectRun = await realWorker.runOnce();
    assert.equal(projectRun.verificationProcessed, 1);
    assert.equal(projectRun.evidenceProcessed, 1);
    assert.equal((await counts(pool)).project_submissions, 1);
    assert.equal((await counts(pool)).evidence, 2);

    await assert.rejects(
      () => controller.submitPractice(learnerRequest(ids.otherLearner), {
        practiceRevisionId: ids.practicePass,
        requestId: "runtime-unauthorized-request",
        artifact: { source: "stolen attempt" },
      }),
      AuthorizationDeniedError,
    );

    const failedInfrastructure = await controller.submitPractice(learnerRequest(), {
      practiceRevisionId: ids.practiceError,
      requestId: "runtime-error-request-0001",
      artifact: { source: "valid learner attempt" },
    });
    assert.equal(failedInfrastructure.status, "QUEUED");
    const errorRun = await realWorker.runOnce();
    assert.equal(errorRun.verificationProcessed, 1);
    assert.equal(errorRun.verificationErrors, 1);
    const errorResult = await pool.query(
      `SELECT outcome FROM verification_results result
       JOIN verification_attempts attempt ON attempt.id=result.verification_attempt_id
       WHERE attempt.practice_submission_id=$1::uuid`,
      [failedInfrastructure.submissionId],
    );
    assert.equal(errorResult.rows[0]?.outcome, "ERROR");
    assert.equal((await counts(pool)).evidence, 2);

    const retryable = await controller.submitPractice(learnerRequest(), {
      practiceRevisionId: ids.practiceRetry,
      requestId: "runtime-evidence-retry-0001",
      artifact: { source: "retryable evidence path" },
    });
    const failingEvidenceWorker = new AuthorityWorker(queue, verification, {
      async processPassedVerificationEvent() {
        throw new Error("simulated evidence persistence dependency failure");
      },
    });
    const failedEvidenceRun = await failingEvidenceWorker.runOnce();
    assert.equal(failedEvidenceRun.verificationProcessed, 1);
    assert.equal(failedEvidenceRun.deliveryFailures, 1);
    const pendingPassed = await pool.query(
      `SELECT count(*)::integer AS count FROM outbox_events
        WHERE event_type='verification.passed' AND published_at IS NULL`,
    );
    assert.equal(pendingPassed.rows[0]?.count, 1);
    assert.equal((await counts(pool)).evidence, 2);

    const recovered = await realWorker.runOnce();
    assert.equal(recovered.evidenceProcessed, 1);
    assert.equal((await counts(pool)).evidence, 3);
    const retryEvidence = await pool.query(
      `SELECT count(*)::integer AS count
         FROM skill_evidence evidence
         JOIN verification_results result ON result.id=evidence.verification_result_id
         JOIN verification_attempts attempt ON attempt.id=result.verification_attempt_id
        WHERE attempt.practice_submission_id=$1::uuid`,
      [retryable.submissionId],
    );
    assert.equal(retryEvidence.rows[0]?.count, 1);

    const verificationRequests = await pool.query(
      `SELECT aggregate_id, count(*)::integer AS count
         FROM outbox_events WHERE event_type='verification.requested'
        GROUP BY aggregate_id HAVING count(*) > 1`,
    );
    assert.equal(verificationRequests.rowCount, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
});
