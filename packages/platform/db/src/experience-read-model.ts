import type { Pool } from "pg";
import type {
  InstructorCohortOverview,
  InstructorCohorts,
  InstructorLearnerDetail,
  LearnerOverview,
  VerificationUiState,
} from "@skill-platform/contracts/experience";

function verificationState(
  submissionId: string | null,
  attemptStatus: string | null,
  outcome: string | null,
): VerificationUiState {
  if (!submissionId) return "NOT_SUBMITTED";
  if (outcome === "PASSED") return "PASSED";
  if (outcome === "FAILED") return "FAILED";
  if (outcome === "ERROR") return "SYSTEM_ERROR";
  if (attemptStatus === "RUNNING") return "RUNNING";
  if (attemptStatus === "COMPLETED") return "SYSTEM_ERROR";
  return "PENDING";
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class ExperienceReadModel {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  private async evidence(tenantId: string, learnerId: string): Promise<LearnerOverview["evidence"]> {
    const result = await this.pool.query<{
      evidence_id: string; skill_id: string; skill_name: string; verification_result_id: string; issued_at: Date;
    }>(
      `SELECT e.id AS evidence_id, e.skill_id, s.name AS skill_name, e.verification_result_id, e.issued_at
         FROM skill_evidence e
         JOIN skills s ON s.tenant_id = e.tenant_id AND s.id = e.skill_id
        WHERE e.tenant_id = $1 AND e.learner_id = $2
        ORDER BY e.issued_at DESC`,
      [tenantId, learnerId],
    );
    return result.rows.map((row) => ({
      evidenceId: row.evidence_id,
      skillId: row.skill_id,
      skillName: row.skill_name,
      verificationResultId: row.verification_result_id,
      issuedAt: iso(row.issued_at),
    }));
  }

  private async competencies(tenantId: string, learnerId: string): Promise<LearnerOverview["competencies"]> {
    const result = await this.pool.query<{
      skill_id: string; skill_name: string; status: "NOT_YET_EVIDENCED" | "EVIDENCED"; evidence_count: number; projected_at: Date;
    }>(
      `SELECT c.skill_id, s.name AS skill_name, c.status::text AS status, c.evidence_count, c.projected_at
         FROM competency_states c
         JOIN skills s ON s.tenant_id = c.tenant_id AND s.id = c.skill_id
        WHERE c.tenant_id = $1 AND c.learner_id = $2
        ORDER BY s.name`,
      [tenantId, learnerId],
    );
    return result.rows.map((row) => ({
      skillId: row.skill_id,
      skillName: row.skill_name,
      status: row.status,
      evidenceCount: Number(row.evidence_count),
      projectedAt: iso(row.projected_at),
    }));
  }

  async getLearnerOverview(tenantId: string, learnerId: string): Promise<LearnerOverview> {
    const assigned = await this.pool.query<{ course_version_id: string; title: string }>(
      `SELECT DISTINCT cv.id AS course_version_id, cv.title
         FROM cohort_memberships cm
         JOIN learning_assignments la
           ON la.tenant_id = cm.tenant_id AND la.cohort_id = cm.cohort_id AND la.is_primary = true
         JOIN course_versions cv
           ON cv.tenant_id = la.tenant_id AND cv.id = la.course_version_id AND cv.status = 'PUBLISHED'
        WHERE cm.tenant_id = $1 AND cm.learner_id = $2 AND cm.status = 'ENROLLED'
        ORDER BY cv.title`,
      [tenantId, learnerId],
    );

    const courseIds = assigned.rows.map((row) => row.course_version_id);
    const assignedLearning: LearnerOverview["assignedLearning"] = assigned.rows.map((row) => ({
      courseVersionId: row.course_version_id,
      title: row.title,
      lessons: [],
      projects: [],
    }));
    const courseById = new Map(assignedLearning.map((course) => [course.courseVersionId, course]));

    if (courseIds.length > 0) {
      const lessons = await this.pool.query<{
        course_version_id: string; lesson_version_id: string; title: string; completion_state: string | null;
      }>(
        `SELECT ch.course_version_id, l.id AS lesson_version_id, l.title, lp.state AS completion_state
           FROM chapter_versions ch
           JOIN lesson_versions l ON l.tenant_id = ch.tenant_id AND l.chapter_version_id = ch.id
           LEFT JOIN lesson_progress lp
             ON lp.tenant_id = l.tenant_id AND lp.lesson_version_id = l.id AND lp.learner_id = $2
          WHERE ch.tenant_id = $1 AND ch.course_version_id = ANY($3::uuid[])
          ORDER BY ch.course_version_id, ch.position, l.position`,
        [tenantId, learnerId, courseIds],
      );
      const lessonById = new Map<string, LearnerOverview["assignedLearning"][number]["lessons"][number]>();
      for (const row of lessons.rows) {
        const lesson = {
          lessonVersionId: row.lesson_version_id,
          title: row.title,
          completionState: row.completion_state,
          practices: [],
        };
        courseById.get(row.course_version_id)?.lessons.push(lesson);
        lessonById.set(row.lesson_version_id, lesson);
      }

      const practices = await this.pool.query<{
        lesson_version_id: string; practice_id: string; practice_revision_id: string; key: string;
        attempt_number: number | null; submission_id: string | null; attempt_status: string | null; outcome: string | null;
      }>(
        `SELECT pd.lesson_version_id, pd.id AS practice_id, pr.id AS practice_revision_id, pd.key,
                ps.attempt_number, ps.id AS submission_id, verification.attempt_status, verification.outcome
           FROM practice_definitions pd
           JOIN LATERAL (
             SELECT revision.id
               FROM practice_revisions revision
              WHERE revision.tenant_id = pd.tenant_id AND revision.practice_id = pd.id
              ORDER BY revision.revision_number DESC LIMIT 1
           ) pr ON true
           LEFT JOIN LATERAL (
             SELECT submission.id, submission.attempt_number
               FROM practice_submissions submission
              WHERE submission.tenant_id = pd.tenant_id
                AND submission.learner_id = $2
                AND submission.practice_revision_id = pr.id
              ORDER BY submission.attempt_number DESC LIMIT 1
           ) ps ON true
           LEFT JOIN LATERAL (
             SELECT attempt.status::text AS attempt_status, result.outcome::text AS outcome
               FROM verification_attempts attempt
               LEFT JOIN verification_results result
                 ON result.tenant_id = attempt.tenant_id AND result.verification_attempt_id = attempt.id
              WHERE attempt.tenant_id = pd.tenant_id AND attempt.practice_submission_id = ps.id
              ORDER BY attempt.created_at DESC LIMIT 1
           ) verification ON ps.id IS NOT NULL
           JOIN lesson_versions lesson ON lesson.tenant_id = pd.tenant_id AND lesson.id = pd.lesson_version_id
           JOIN chapter_versions chapter ON chapter.tenant_id = lesson.tenant_id AND chapter.id = lesson.chapter_version_id
          WHERE pd.tenant_id = $1 AND chapter.course_version_id = ANY($3::uuid[])
          ORDER BY chapter.course_version_id, pd.key`,
        [tenantId, learnerId, courseIds],
      );
      for (const row of practices.rows) {
        lessonById.get(row.lesson_version_id)?.practices.push({
          practiceId: row.practice_id,
          practiceRevisionId: row.practice_revision_id,
          key: row.key,
          attemptNumber: row.attempt_number === null ? null : Number(row.attempt_number),
          submissionId: row.submission_id,
          verificationState: verificationState(row.submission_id, row.attempt_status, row.outcome),
        });
      }

      const projects = await this.pool.query<{
        course_version_id: string; project_definition_id: string; title: string; artifact_revision_id: string | null;
        submission_id: string | null; attempt_status: string | null; outcome: string | null;
      }>(
        `SELECT alignment.course_version_id, project.id AS project_definition_id, project.title,
                artifact_revision.id AS artifact_revision_id, project_submission.id AS submission_id,
                verification.attempt_status, verification.outcome
           FROM project_learning_alignments alignment
           JOIN project_definitions project
             ON project.tenant_id = alignment.tenant_id AND project.id = alignment.project_definition_id
           LEFT JOIN LATERAL (
             SELECT artifact.id
               FROM project_artifacts artifact
              WHERE artifact.tenant_id = alignment.tenant_id
                AND artifact.learner_id = $2
                AND artifact.project_definition_id = project.id
              ORDER BY artifact.created_at DESC LIMIT 1
           ) artifact ON true
           LEFT JOIN LATERAL (
             SELECT revision.id
               FROM artifact_revisions revision
              WHERE revision.tenant_id = alignment.tenant_id AND revision.artifact_id = artifact.id
              ORDER BY revision.revision_number DESC LIMIT 1
           ) artifact_revision ON artifact.id IS NOT NULL
           LEFT JOIN LATERAL (
             SELECT submission.id
               FROM project_submissions submission
              WHERE submission.tenant_id = alignment.tenant_id
                AND submission.learner_id = $2
                AND submission.artifact_revision_id = artifact_revision.id
              ORDER BY submission.created_at DESC LIMIT 1
           ) project_submission ON artifact_revision.id IS NOT NULL
           LEFT JOIN LATERAL (
             SELECT attempt.status::text AS attempt_status, result.outcome::text AS outcome
               FROM verification_attempts attempt
               LEFT JOIN verification_results result
                 ON result.tenant_id = attempt.tenant_id AND result.verification_attempt_id = attempt.id
              WHERE attempt.tenant_id = alignment.tenant_id AND attempt.project_submission_id = project_submission.id
              ORDER BY attempt.created_at DESC LIMIT 1
           ) verification ON project_submission.id IS NOT NULL
          WHERE alignment.tenant_id = $1 AND alignment.course_version_id = ANY($3::uuid[])
          ORDER BY alignment.course_version_id, alignment.position`,
        [tenantId, learnerId, courseIds],
      );
      for (const row of projects.rows) {
        courseById.get(row.course_version_id)?.projects.push({
          projectDefinitionId: row.project_definition_id,
          title: row.title,
          artifactRevisionId: row.artifact_revision_id,
          submissionId: row.submission_id,
          verificationState: verificationState(row.submission_id, row.attempt_status, row.outcome),
        });
      }
    }

    return {
      learnerId,
      assignedLearning,
      evidence: await this.evidence(tenantId, learnerId),
      competencies: await this.competencies(tenantId, learnerId),
    };
  }

  async getInstructorCohorts(tenantId: string, instructorId: string): Promise<InstructorCohorts> {
    const result = await this.pool.query<{
      cohort_id: string; name: string; status: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
      primary_course_title: string | null; active_learner_count: number;
    }>(
      `SELECT cohort.id AS cohort_id, cohort.name, cohort.status::text AS status,
              course.title AS primary_course_title,
              COUNT(membership.id) FILTER (WHERE membership.status = 'ENROLLED')::int AS active_learner_count
         FROM instructor_cohort_roles role
         JOIN cohorts cohort ON cohort.tenant_id = role.tenant_id AND cohort.id = role.cohort_id
         LEFT JOIN learning_assignments assignment
           ON assignment.tenant_id = cohort.tenant_id AND assignment.cohort_id = cohort.id AND assignment.is_primary = true
         LEFT JOIN course_versions course
           ON course.tenant_id = assignment.tenant_id AND course.id = assignment.course_version_id
         LEFT JOIN cohort_memberships membership
           ON membership.tenant_id = cohort.tenant_id AND membership.cohort_id = cohort.id
        WHERE role.tenant_id = $1 AND role.instructor_id = $2
        GROUP BY cohort.id, cohort.name, cohort.status, course.title
        ORDER BY cohort.name`,
      [tenantId, instructorId],
    );
    return { cohorts: result.rows.map((row) => ({
      cohortId: row.cohort_id,
      name: row.name,
      status: row.status,
      primaryCourseTitle: row.primary_course_title,
      activeLearnerCount: Number(row.active_learner_count),
    })) };
  }

  async isInstructorForCohort(tenantId: string, instructorId: string, cohortId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM instructor_cohort_roles
        WHERE tenant_id = $1 AND instructor_id = $2 AND cohort_id = $3 LIMIT 1`,
      [tenantId, instructorId, cohortId],
    );
    return result.rowCount === 1;
  }

  async isActiveLearnerInCohort(tenantId: string, cohortId: string, learnerId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM cohort_memberships
        WHERE tenant_id = $1 AND cohort_id = $2 AND learner_id = $3 AND status = 'ENROLLED' LIMIT 1`,
      [tenantId, cohortId, learnerId],
    );
    return result.rowCount === 1;
  }

  async getInstructorCohortOverview(tenantId: string, instructorId: string, cohortId: string): Promise<InstructorCohortOverview | null> {
    const cohorts = await this.getInstructorCohorts(tenantId, instructorId);
    const cohort = cohorts.cohorts.find((item) => item.cohortId === cohortId);
    if (!cohort) return null;
    const roster = await this.pool.query<{
      learner_id: string; display_name: string | null; completed_lessons: number; total_lessons: number;
      submission_count: number; evidence_count: number;
    }>(
      `SELECT member.id AS learner_id, member.display_name,
              COUNT(DISTINCT progress.lesson_version_id) FILTER (WHERE lower(progress.state) = 'completed')::int AS completed_lessons,
              COUNT(DISTINCT lesson.id)::int AS total_lessons,
              (
                SELECT COUNT(*)::int FROM practice_submissions ps
                 WHERE ps.tenant_id = membership.tenant_id AND ps.learner_id = membership.learner_id
              ) + (
                SELECT COUNT(*)::int FROM project_submissions pjs
                 WHERE pjs.tenant_id = membership.tenant_id AND pjs.learner_id = membership.learner_id
              ) AS submission_count,
              (
                SELECT COUNT(*)::int FROM skill_evidence evidence
                 WHERE evidence.tenant_id = membership.tenant_id AND evidence.learner_id = membership.learner_id
              ) AS evidence_count
         FROM cohort_memberships membership
         JOIN members member ON member.tenant_id = membership.tenant_id AND member.id = membership.learner_id
         LEFT JOIN learning_assignments assignment
           ON assignment.tenant_id = membership.tenant_id AND assignment.cohort_id = membership.cohort_id AND assignment.is_primary = true
         LEFT JOIN chapter_versions chapter
           ON chapter.tenant_id = assignment.tenant_id AND chapter.course_version_id = assignment.course_version_id
         LEFT JOIN lesson_versions lesson
           ON lesson.tenant_id = chapter.tenant_id AND lesson.chapter_version_id = chapter.id
         LEFT JOIN lesson_progress progress
           ON progress.tenant_id = lesson.tenant_id AND progress.lesson_version_id = lesson.id AND progress.learner_id = membership.learner_id
        WHERE membership.tenant_id = $1 AND membership.cohort_id = $2 AND membership.status = 'ENROLLED'
        GROUP BY membership.tenant_id, membership.learner_id, member.id, member.display_name
        ORDER BY member.display_name NULLS LAST, member.id`,
      [tenantId, cohortId],
    );
    return {
      cohort,
      roster: roster.rows.map((row) => ({
        learnerId: row.learner_id,
        displayName: row.display_name,
        completedLessons: Number(row.completed_lessons),
        totalLessons: Number(row.total_lessons),
        submissionCount: Number(row.submission_count),
        evidenceCount: Number(row.evidence_count),
      })),
    };
  }

  async getInstructorLearnerDetail(tenantId: string, cohortId: string, learnerId: string): Promise<InstructorLearnerDetail | null> {
    const learner = await this.pool.query<{ display_name: string | null; completed_lessons: number; total_lessons: number }>(
      `SELECT member.display_name,
              COUNT(DISTINCT progress.lesson_version_id) FILTER (WHERE lower(progress.state) = 'completed')::int AS completed_lessons,
              COUNT(DISTINCT lesson.id)::int AS total_lessons
         FROM cohort_memberships membership
         JOIN members member ON member.tenant_id = membership.tenant_id AND member.id = membership.learner_id
         LEFT JOIN learning_assignments assignment
           ON assignment.tenant_id = membership.tenant_id AND assignment.cohort_id = membership.cohort_id AND assignment.is_primary = true
         LEFT JOIN chapter_versions chapter
           ON chapter.tenant_id = assignment.tenant_id AND chapter.course_version_id = assignment.course_version_id
         LEFT JOIN lesson_versions lesson ON lesson.tenant_id = chapter.tenant_id AND lesson.chapter_version_id = chapter.id
         LEFT JOIN lesson_progress progress
           ON progress.tenant_id = lesson.tenant_id AND progress.lesson_version_id = lesson.id AND progress.learner_id = membership.learner_id
        WHERE membership.tenant_id = $1 AND membership.cohort_id = $2 AND membership.learner_id = $3 AND membership.status = 'ENROLLED'
        GROUP BY member.id, member.display_name`,
      [tenantId, cohortId, learnerId],
    );
    const row = learner.rows[0];
    if (!row) return null;
    const guidance = await this.pool.query<{ id: string; message: string; created_at: Date; instructor_id: string }>(
      `SELECT id, message, created_at, instructor_id FROM instructor_guidance
        WHERE tenant_id = $1 AND cohort_id = $2 AND learner_id = $3
        ORDER BY created_at DESC`,
      [tenantId, cohortId, learnerId],
    );
    return {
      learnerId,
      displayName: row.display_name,
      completedLessons: Number(row.completed_lessons),
      totalLessons: Number(row.total_lessons),
      evidence: await this.evidence(tenantId, learnerId),
      competencies: await this.competencies(tenantId, learnerId),
      guidance: guidance.rows.map((item) => ({
        guidanceId: item.id,
        message: item.message,
        createdAt: iso(item.created_at),
        instructorId: item.instructor_id,
      })),
    };
  }
}
