import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { AiCoachingService } from "../../packages/modules/ai-coaching/src/application/coach.ts";
import { UnavailableAiCoachingProvider } from "../../packages/modules/ai-coaching/src/infrastructure/unavailable-provider.ts";
import { PgCohortOperations } from "../../packages/modules/cohorts/src/infrastructure/pg-cohort-operations.ts";
import { PgGuidanceWriter } from "../../packages/modules/cohorts/src/infrastructure/pg-guidance-writer.ts";
import { PgCompetencyAuthority } from "../../packages/modules/competency/src/infrastructure/pg-authority.ts";
import { VerificationDispatcherService, type VerifierExecutor } from "../../packages/modules/verification/src/application/authority.ts";
import { PgVerificationAuthority } from "../../packages/modules/verification/src/infrastructure/pg-authority.ts";
import { ExperienceReadModel } from "../../packages/platform/db/src/experience-read-model.ts";

const ids = {
  tenant: "00000000-0000-7000-8000-000000000201",
  learner: "00000000-0000-7000-8000-000000000202",
  instructor: "00000000-0000-7000-8000-000000000203",
  course: "00000000-0000-7000-8000-000000000204",
  courseVersion: "00000000-0000-7000-8000-000000000205",
  chapter: "00000000-0000-7000-8000-000000000206",
  lesson: "00000000-0000-7000-8000-000000000207",
  practiceSkill: "00000000-0000-7000-8000-000000000208",
  projectSkill: "00000000-0000-7000-8000-000000000209",
  cohort: "00000000-0000-7000-8000-00000000020a",
  assignment: "00000000-0000-7000-8000-00000000020b",
  membership: "00000000-0000-7000-8000-00000000020c",
  instructorRole: "00000000-0000-7000-8000-00000000020d",
  enrollment: "00000000-0000-7000-8000-00000000020e",
  progress: "00000000-0000-7000-8000-00000000020f",
  practice: "00000000-0000-7000-8000-000000000210",
  practiceRevision: "00000000-0000-7000-8000-000000000211",
  practiceSubmission: "00000000-0000-7000-8000-000000000212",
  practiceAttempt: "00000000-0000-7000-8000-000000000213",
  project: "00000000-0000-7000-8000-000000000214",
  projectLearningAlignment: "00000000-0000-7000-8000-000000000215",
  projectSkillAlignment: "00000000-0000-7000-8000-000000000216",
  artifact: "00000000-0000-7000-8000-000000000217",
  artifactRevision: "00000000-0000-7000-8000-000000000218",
  projectSubmission: "00000000-0000-7000-8000-000000000219",
  projectAttempt: "00000000-0000-7000-8000-00000000021a",
  guidance: "00000000-0000-7000-8000-00000000021b",
} as const;

const passingVerifier: VerifierExecutor = {
  async execute() {
    return {
      outcome: "PASSED",
      diagnostic: {
        classification: "VERIFICATION",
        summaryCode: "ALL_CHECKS_PASS",
        passedChecks: 3,
        totalChecks: 3,
      },
    };
  },
};

async function processResult(pool: Pool, resultId: string): Promise<void> {
  const event = await pool.query(
    `SELECT id FROM outbox_events
      WHERE tenant_id = $1::uuid
        AND event_type = 'verification.passed'
        AND aggregate_id = $2`,
    [ids.tenant, resultId],
  );
  assert.equal(event.rowCount, 1);
  await new PgCompetencyAuthority(pool).processPassedVerificationEvent(String(event.rows[0].id));
}

test("canonical learner -> verification -> evidence -> competency -> instructor journey survives AI outage", async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      INSERT INTO tenants (id, slug) VALUES ('${ids.tenant}', 'm12-e2e');
      INSERT INTO members (id, tenant_id, auth_user_id, display_name) VALUES
        ('${ids.learner}', '${ids.tenant}', 'auth-e2e-learner', 'E2E Learner'),
        ('${ids.instructor}', '${ids.tenant}', 'auth-e2e-instructor', 'E2E Instructor');
      INSERT INTO member_roles (tenant_id, member_id, role) VALUES
        ('${ids.tenant}', '${ids.learner}', 'LEARNER'),
        ('${ids.tenant}', '${ids.instructor}', 'INSTRUCTOR');
      INSERT INTO courses (id, tenant_id, key)
        VALUES ('${ids.course}', '${ids.tenant}', 'm12-e2e-course');
      INSERT INTO course_versions (id, tenant_id, course_id, version, status, title, published_at)
        VALUES ('${ids.courseVersion}', '${ids.tenant}', '${ids.course}', 1, 'PUBLISHED', 'M12 E2E Course', now());
      INSERT INTO chapter_versions (id, tenant_id, course_version_id, position, title)
        VALUES ('${ids.chapter}', '${ids.tenant}', '${ids.courseVersion}', 1, 'Chapter');
      INSERT INTO lesson_versions (id, tenant_id, chapter_version_id, position, title, content)
        VALUES ('${ids.lesson}', '${ids.tenant}', '${ids.chapter}', 1, 'Practice First', '{"type":"microlearning"}'::jsonb);
      INSERT INTO skills (id, tenant_id, key, name) VALUES
        ('${ids.practiceSkill}', '${ids.tenant}', 'practice-skill', 'Practice Skill'),
        ('${ids.projectSkill}', '${ids.tenant}', 'project-skill', 'Project Skill');
      INSERT INTO cohorts (id, tenant_id, key, name)
        VALUES ('${ids.cohort}', '${ids.tenant}', 'm12-e2e-cohort', 'M12 E2E Cohort');
      INSERT INTO instructor_cohort_roles (id, tenant_id, cohort_id, instructor_id)
        VALUES ('${ids.instructorRole}', '${ids.tenant}', '${ids.cohort}', '${ids.instructor}');
      INSERT INTO enrollments (id, tenant_id, learner_id, course_version_id)
        VALUES ('${ids.enrollment}', '${ids.tenant}', '${ids.learner}', '${ids.courseVersion}');
      INSERT INTO practice_definitions (id, tenant_id, lesson_version_id, key)
        VALUES ('${ids.practice}', '${ids.tenant}', '${ids.lesson}', 'practice-first-check');
      INSERT INTO practice_revisions (id, tenant_id, practice_id, skill_id, revision_number, definition)
        VALUES ('${ids.practiceRevision}', '${ids.tenant}', '${ids.practice}', '${ids.practiceSkill}', 1, '{"kind":"code"}'::jsonb);
      INSERT INTO project_definitions (id, tenant_id, key, title)
        VALUES ('${ids.project}', '${ids.tenant}', 'm12-e2e-project', 'Authentic Project');
      INSERT INTO project_learning_alignments (id, tenant_id, course_version_id, project_definition_id, position)
        VALUES ('${ids.projectLearningAlignment}', '${ids.tenant}', '${ids.courseVersion}', '${ids.project}', 1);
      INSERT INTO project_skill_alignments (id, tenant_id, project_definition_id, skill_id)
        VALUES ('${ids.projectSkillAlignment}', '${ids.tenant}', '${ids.project}', '${ids.projectSkill}');
    `);

    const cohorts = new PgCohortOperations(pool);
    const assignment = await cohorts.assignPrimaryLearning({
      id: ids.assignment,
      tenantId: ids.tenant,
      cohortId: ids.cohort,
      courseVersionId: ids.courseVersion,
      assignedAt: new Date(),
    });
    assert.equal(assignment.created, true);
    const membership = await cohorts.enrollLearner({
      id: ids.membership,
      tenantId: ids.tenant,
      cohortId: ids.cohort,
      learnerId: ids.learner,
      enrolledAt: new Date(),
    });
    assert.equal(membership.created, true);
    const active = await cohorts.transition({
      tenantId: ids.tenant,
      cohortId: ids.cohort,
      expectedVersion: 0,
      to: "ACTIVE",
    });
    assert.equal(active.status, "ACTIVE");

    await pool.query(
      `INSERT INTO lesson_progress (id, tenant_id, learner_id, lesson_version_id, state, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'COMPLETED', now())`,
      [ids.progress, ids.tenant, ids.learner, ids.lesson],
    );

    const ai = new AiCoachingService(
      new UnavailableAiCoachingProvider(),
      { record() {} },
    );
    const aiResponse = await ai.coach({
      mode: "HINT",
      context: {
        kind: "PRACTICE",
        title: "Practice First",
        learnerVisiblePrompt: "Explain the next safe step.",
        learnerAttempt: "const value = unknownValue",
      },
      question: "What should I inspect next?",
    });
    assert.equal(aiResponse.status, "UNAVAILABLE");

    await pool.query(
      `INSERT INTO practice_submissions
         (id, tenant_id, learner_id, practice_revision_id, attempt_number, request_id, artifact)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 1, 'e2e-practice-submit', '{"source":"answer"}'::jsonb)`,
      [ids.practiceSubmission, ids.tenant, ids.learner, ids.practiceRevision],
    );

    const verificationRepository = new PgVerificationAuthority(pool);
    const dispatcher = new VerificationDispatcherService(verificationRepository, passingVerifier);
    const practiceResult = await dispatcher.verify({
      id: ids.practiceAttempt,
      requestId: "e2e-practice-verify",
      tenantId: ids.tenant,
      target: { kind: "PRACTICE", submissionId: ids.practiceSubmission },
      verifierKey: "typescript",
      verifierVersion: "1",
      createdAt: new Date(),
      artifactRef: "artifact://practice/e2e",
      hiddenTestBundleRef: "private://hidden/practice",
    });
    assert.equal(practiceResult.outcome, "PASSED");
    const practiceRetry = await dispatcher.verify({
      id: "00000000-0000-7000-8000-00000000021c",
      requestId: "e2e-practice-verify",
      tenantId: ids.tenant,
      target: { kind: "PRACTICE", submissionId: ids.practiceSubmission },
      verifierKey: "typescript",
      verifierVersion: "1",
      createdAt: new Date(),
      artifactRef: "artifact://practice/e2e",
      hiddenTestBundleRef: "private://hidden/practice",
    });
    assert.equal(practiceRetry.id, practiceResult.id);
    await processResult(pool, practiceResult.id);

    await pool.query(`
      INSERT INTO project_artifacts (id, tenant_id, learner_id, project_definition_id)
        VALUES ('${ids.artifact}', '${ids.tenant}', '${ids.learner}', '${ids.project}');
      INSERT INTO artifact_revisions
        (id, tenant_id, artifact_id, revision_number, object_key, content_hash, sealed_at)
        VALUES ('${ids.artifactRevision}', '${ids.tenant}', '${ids.artifact}', 1, 'm12/e2e/project/rev1', 'sha256:e2e', now());
      INSERT INTO project_submissions (id, tenant_id, learner_id, artifact_revision_id, request_id)
        VALUES ('${ids.projectSubmission}', '${ids.tenant}', '${ids.learner}', '${ids.artifactRevision}', 'e2e-project-submit');
    `);

    const projectResult = await dispatcher.verify({
      id: ids.projectAttempt,
      requestId: "e2e-project-verify",
      tenantId: ids.tenant,
      target: { kind: "PROJECT", submissionId: ids.projectSubmission },
      verifierKey: "project-rubric",
      verifierVersion: "1",
      createdAt: new Date(),
      artifactRef: "artifact://project/e2e",
      hiddenTestBundleRef: "private://hidden/project",
    });
    assert.equal(projectResult.outcome, "PASSED");
    await processResult(pool, projectResult.id);

    const readModel = new ExperienceReadModel(pool);
    const learner = await readModel.getLearnerOverview(ids.tenant, ids.learner);
    assert.equal(learner.assignedLearning.length, 1);
    assert.equal(learner.assignedLearning[0]?.lessons[0]?.completionState, "COMPLETED");
    assert.equal(learner.assignedLearning[0]?.lessons[0]?.practices[0]?.verificationState, "PASSED");
    assert.equal(learner.assignedLearning[0]?.projects[0]?.verificationState, "PASSED");
    assert.equal(learner.evidence.length, 2);
    assert.equal(learner.competencies.length, 2);
    assert.equal(learner.competencies.every((item) => item.status === "EVIDENCED"), true);

    const instructorCohort = await readModel.getInstructorCohortOverview(ids.tenant, ids.instructor, ids.cohort);
    assert.equal(instructorCohort?.roster.length, 1);
    assert.equal(instructorCohort?.roster[0]?.evidenceCount, 2);

    await new PgGuidanceWriter(pool).create({
      id: ids.guidance,
      tenantId: ids.tenant,
      cohortId: ids.cohort,
      instructorId: ids.instructor,
      learnerId: ids.learner,
      message: "Explain the reasoning behind the verified solution and identify one refinement.",
      createdAt: new Date(),
    });
    const learnerDetail = await readModel.getInstructorLearnerDetail(ids.tenant, ids.cohort, ids.learner);
    assert.equal(learnerDetail?.guidance.length, 1);
    assert.equal(learnerDetail?.evidence.length, 2);
    assert.equal(learnerDetail?.competencies.every((item) => item.status === "EVIDENCED"), true);

    const authorityBeforeCompletion = await pool.query(
      `SELECT
         (SELECT count(*)::integer FROM skill_evidence WHERE tenant_id=$1 AND learner_id=$2) AS evidence_count,
         (SELECT count(*)::integer FROM competency_states WHERE tenant_id=$1 AND learner_id=$2 AND status='EVIDENCED') AS competency_count`,
      [ids.tenant, ids.learner],
    );
    const completed = await cohorts.transition({
      tenantId: ids.tenant,
      cohortId: ids.cohort,
      expectedVersion: 1,
      to: "COMPLETED",
    });
    assert.equal(completed.status, "COMPLETED");
    const authorityAfterCompletion = await pool.query(
      `SELECT
         (SELECT count(*)::integer FROM skill_evidence WHERE tenant_id=$1 AND learner_id=$2) AS evidence_count,
         (SELECT count(*)::integer FROM competency_states WHERE tenant_id=$1 AND learner_id=$2 AND status='EVIDENCED') AS competency_count`,
      [ids.tenant, ids.learner],
    );
    assert.deepEqual(authorityAfterCompletion.rows[0], authorityBeforeCompletion.rows[0]);
  } finally {
    await pool.end();
  }
});
