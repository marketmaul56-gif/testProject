import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { PgGuidanceWriter } from "../../packages/modules/cohorts/src/infrastructure/pg-guidance-writer.ts";
import { ExperienceReadModel } from "../../packages/platform/db/src/experience-read-model.ts";

const id = {
  tenant: "00000000-0000-7000-8000-000000000001",
  learner: "00000000-0000-7000-8000-000000000002",
  instructor: "00000000-0000-7000-8000-000000000003",
  course: "00000000-0000-7000-8000-000000000004",
  courseVersion: "00000000-0000-7000-8000-000000000005",
  chapter: "00000000-0000-7000-8000-000000000006",
  lesson: "00000000-0000-7000-8000-000000000007",
  practiceSkill: "00000000-0000-7000-8000-000000000008",
  projectSkill: "00000000-0000-7000-8000-000000000009",
  cohort: "00000000-0000-7000-8000-00000000000a",
  membership: "00000000-0000-7000-8000-00000000000b",
  assignment: "00000000-0000-7000-8000-00000000000c",
  instructorRole: "00000000-0000-7000-8000-00000000000d",
  progress: "00000000-0000-7000-8000-00000000000e",
  practice: "00000000-0000-7000-8000-00000000000f",
  practiceRevision: "00000000-0000-7000-8000-000000000010",
  practiceSubmission: "00000000-0000-7000-8000-000000000011",
  practiceAttempt: "00000000-0000-7000-8000-000000000012",
  practiceResult: "00000000-0000-7000-8000-000000000013",
  project: "00000000-0000-7000-8000-000000000014",
  alignment: "00000000-0000-7000-8000-000000000015",
  artifact: "00000000-0000-7000-8000-000000000016",
  revision: "00000000-0000-7000-8000-000000000017",
  projectSubmission: "00000000-0000-7000-8000-000000000018",
  projectAttempt: "00000000-0000-7000-8000-000000000019",
  projectResult: "00000000-0000-7000-8000-00000000001a",
  evidence: "00000000-0000-7000-8000-00000000001b",
  practiceCompetency: "00000000-0000-7000-8000-00000000001c",
  projectCompetency: "00000000-0000-7000-8000-00000000001d",
  guidance: "00000000-0000-7000-8000-00000000001e",
  projectSkillAlignment: "00000000-0000-7000-8000-00000000001f",
} as const;

test("learner and instructor views keep progress, system errors, evidence and competency distinct", async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      INSERT INTO tenants (id, slug) VALUES ('${id.tenant}', 'experience-test');
      INSERT INTO members (id, tenant_id, auth_user_id, display_name) VALUES
        ('${id.learner}', '${id.tenant}', 'auth-learner', 'Ada Learner'),
        ('${id.instructor}', '${id.tenant}', 'auth-instructor', 'Ira Instructor');
      INSERT INTO member_roles (tenant_id, member_id, role) VALUES
        ('${id.tenant}', '${id.learner}', 'LEARNER'),
        ('${id.tenant}', '${id.instructor}', 'INSTRUCTOR');
      INSERT INTO courses (id, tenant_id, key) VALUES ('${id.course}', '${id.tenant}', 'typescript-foundations');
      INSERT INTO course_versions (id, tenant_id, course_id, version, status, title, published_at)
        VALUES ('${id.courseVersion}', '${id.tenant}', '${id.course}', 1, 'PUBLISHED', 'TypeScript Foundations', now());
      INSERT INTO chapter_versions (id, tenant_id, course_version_id, position, title)
        VALUES ('${id.chapter}', '${id.tenant}', '${id.courseVersion}', 1, 'Core Types');
      INSERT INTO lesson_versions (id, tenant_id, chapter_version_id, position, title, content)
        VALUES ('${id.lesson}', '${id.tenant}', '${id.chapter}', 1, 'Narrowing', '{"type":"microlearning"}'::jsonb);
      INSERT INTO skills (id, tenant_id, key, name) VALUES
        ('${id.practiceSkill}', '${id.tenant}', 'ts-narrowing', 'Type Narrowing'),
        ('${id.projectSkill}', '${id.tenant}', 'ts-project', 'TypeScript Project Delivery');
      INSERT INTO cohorts (id, tenant_id, key, name, status)
        VALUES ('${id.cohort}', '${id.tenant}', 'cohort-a', 'Cohort A', 'ACTIVE');
      INSERT INTO cohort_memberships (id, tenant_id, cohort_id, learner_id, status, enrolled_at)
        VALUES ('${id.membership}', '${id.tenant}', '${id.cohort}', '${id.learner}', 'ENROLLED', now());
      INSERT INTO learning_assignments (id, tenant_id, cohort_id, course_version_id, is_primary, assigned_at)
        VALUES ('${id.assignment}', '${id.tenant}', '${id.cohort}', '${id.courseVersion}', true, now());
      INSERT INTO instructor_cohort_roles (id, tenant_id, cohort_id, instructor_id)
        VALUES ('${id.instructorRole}', '${id.tenant}', '${id.cohort}', '${id.instructor}');
      INSERT INTO lesson_progress (id, tenant_id, learner_id, lesson_version_id, state, updated_at)
        VALUES ('${id.progress}', '${id.tenant}', '${id.learner}', '${id.lesson}', 'COMPLETED', now());

      INSERT INTO practice_definitions (id, tenant_id, lesson_version_id, key)
        VALUES ('${id.practice}', '${id.tenant}', '${id.lesson}', 'narrowing-check');
      INSERT INTO practice_revisions (id, tenant_id, practice_id, skill_id, revision_number, definition)
        VALUES ('${id.practiceRevision}', '${id.tenant}', '${id.practice}', '${id.practiceSkill}', 1, '{"kind":"code"}'::jsonb);
      INSERT INTO practice_submissions (id, tenant_id, learner_id, practice_revision_id, attempt_number, request_id, artifact)
        VALUES ('${id.practiceSubmission}', '${id.tenant}', '${id.learner}', '${id.practiceRevision}', 1, 'req-practice-1', '{"source":"code"}'::jsonb);
      INSERT INTO verification_attempts (id, tenant_id, practice_submission_id, status, verifier_key, verifier_version, request_id, started_at, completed_at)
        VALUES ('${id.practiceAttempt}', '${id.tenant}', '${id.practiceSubmission}', 'COMPLETED', 'code-ts', '1', 'verify-practice-1', now(), now());
      INSERT INTO verification_results (id, tenant_id, verification_attempt_id, learner_id, outcome, diagnostic, completed_at)
        VALUES ('${id.practiceResult}', '${id.tenant}', '${id.practiceAttempt}', '${id.learner}', 'ERROR', '{"classification":"INFRASTRUCTURE"}'::jsonb, now());
      INSERT INTO competency_states (id, tenant_id, learner_id, skill_id, status, evidence_count, projected_at)
        VALUES ('${id.practiceCompetency}', '${id.tenant}', '${id.learner}', '${id.practiceSkill}', 'NOT_YET_EVIDENCED', 0, now());

      INSERT INTO project_definitions (id, tenant_id, key, title)
        VALUES ('${id.project}', '${id.tenant}', 'typed-cli', 'Build a Typed CLI');
      INSERT INTO project_learning_alignments (id, tenant_id, course_version_id, project_definition_id, position)
        VALUES ('${id.alignment}', '${id.tenant}', '${id.courseVersion}', '${id.project}', 1);
      INSERT INTO project_skill_alignments (id, tenant_id, project_definition_id, skill_id)
        VALUES ('${id.projectSkillAlignment}', '${id.tenant}', '${id.project}', '${id.projectSkill}');
      INSERT INTO project_artifacts (id, tenant_id, learner_id, project_definition_id)
        VALUES ('${id.artifact}', '${id.tenant}', '${id.learner}', '${id.project}');
      INSERT INTO artifact_revisions (id, tenant_id, artifact_id, revision_number, object_key, content_hash, sealed_at)
        VALUES ('${id.revision}', '${id.tenant}', '${id.artifact}', 1, 'test/artifact-1', 'sha256:test', now());
      INSERT INTO project_submissions (id, tenant_id, learner_id, artifact_revision_id, request_id)
        VALUES ('${id.projectSubmission}', '${id.tenant}', '${id.learner}', '${id.revision}', 'req-project-1');
      INSERT INTO verification_attempts (id, tenant_id, project_submission_id, status, verifier_key, verifier_version, request_id, started_at, completed_at)
        VALUES ('${id.projectAttempt}', '${id.tenant}', '${id.projectSubmission}', 'COMPLETED', 'project-rubric', '1', 'verify-project-1', now(), now());
      INSERT INTO verification_results (id, tenant_id, verification_attempt_id, learner_id, outcome, diagnostic, completed_at)
        VALUES ('${id.projectResult}', '${id.tenant}', '${id.projectAttempt}', '${id.learner}', 'PASSED', '{"checks":"passed"}'::jsonb, now());
      INSERT INTO skill_evidence (id, tenant_id, learner_id, skill_id, verification_result_id, issued_at)
        VALUES ('${id.evidence}', '${id.tenant}', '${id.learner}', '${id.projectSkill}', '${id.projectResult}', now());
      INSERT INTO competency_states (id, tenant_id, learner_id, skill_id, status, evidence_count, projected_at)
        VALUES ('${id.projectCompetency}', '${id.tenant}', '${id.learner}', '${id.projectSkill}', 'EVIDENCED', 1, now());
    `);

    const readModel = new ExperienceReadModel(pool);
    const learner = await readModel.getLearnerOverview(id.tenant, id.learner);
    assert.equal(learner.assignedLearning.length, 1);
    assert.equal(learner.assignedLearning[0]?.lessons[0]?.completionState, "COMPLETED");
    assert.equal(learner.assignedLearning[0]?.lessons[0]?.practices[0]?.verificationState, "SYSTEM_ERROR");
    assert.equal(learner.assignedLearning[0]?.projects[0]?.verificationState, "PASSED");
    assert.equal(learner.evidence.length, 1);
    assert.equal(learner.competencies.find((item) => item.skillId === id.practiceSkill)?.status, "NOT_YET_EVIDENCED");
    assert.equal(learner.competencies.find((item) => item.skillId === id.projectSkill)?.status, "EVIDENCED");

    const cohorts = await readModel.getInstructorCohorts(id.tenant, id.instructor);
    assert.equal(cohorts.cohorts.length, 1);
    assert.equal(cohorts.cohorts[0]?.activeLearnerCount, 1);
    const cohort = await readModel.getInstructorCohortOverview(id.tenant, id.instructor, id.cohort);
    assert.equal(cohort?.roster[0]?.completedLessons, 1);
    assert.equal(cohort?.roster[0]?.evidenceCount, 1);

    const writer = new PgGuidanceWriter(pool);
    await writer.create({
      id: id.guidance,
      tenantId: id.tenant,
      cohortId: id.cohort,
      instructorId: id.instructor,
      learnerId: id.learner,
      message: "Review the narrowing branch and explain why it is safe.",
      createdAt: new Date(),
    });
    const detail = await readModel.getInstructorLearnerDetail(id.tenant, id.cohort, id.learner);
    assert.equal(detail?.guidance.length, 1);
    assert.equal(detail?.evidence.length, 1);
    assert.equal(detail?.competencies.find((item) => item.skillId === id.practiceSkill)?.status, "NOT_YET_EVIDENCED");
  } finally {
    await pool.end();
  }
});
