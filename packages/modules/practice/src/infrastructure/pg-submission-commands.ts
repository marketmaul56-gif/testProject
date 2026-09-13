import type { Pool, PoolClient } from "pg";
import { uuidV7 } from "../../../../platform/audit/src/security-audit.ts";

export class PracticeSubmissionNotEligibleError extends Error {
  constructor() {
    super("practice revision is not available to this learner");
    this.name = "PracticeSubmissionNotEligibleError";
  }
}

export class PracticeSubmissionConflictError extends Error {
  constructor() {
    super("submission request id was reused with different input");
    this.name = "PracticeSubmissionConflictError";
  }
}

export type QueuedSubmission = Readonly<{
  submissionId: string;
  verificationRequestId: string;
  queuedAt: Date;
  idempotent: boolean;
}>;

export class PgPracticeSubmissionCommands {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async submit(input: Readonly<{
    tenantId: string;
    learnerId: string;
    practiceRevisionId: string;
    requestId: string;
    artifact: Readonly<Record<string, unknown>>;
    submittedAt?: Date;
  }>): Promise<QueuedSubmission> {
    const submittedAt = input.submittedAt ?? new Date();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`practice:${input.tenantId}:${input.learnerId}:${input.practiceRevisionId}:${input.requestId}`],
      );
      await this.assertEligible(client, input.tenantId, input.learnerId, input.practiceRevisionId);

      const existing = await client.query(
        `SELECT id, created_at, artifact = $5::jsonb AS same_artifact
           FROM practice_submissions
          WHERE tenant_id=$1::uuid AND learner_id=$2::uuid
            AND practice_revision_id=$3::uuid AND request_id=$4`,
        [input.tenantId, input.learnerId, input.practiceRevisionId, input.requestId, JSON.stringify(input.artifact)],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].same_artifact !== true) throw new PracticeSubmissionConflictError();
        const queued = await this.findVerificationRequest(client, input.tenantId, String(existing.rows[0].id));
        await client.query("COMMIT");
        return Object.freeze({
          submissionId: String(existing.rows[0].id),
          verificationRequestId: queued.id,
          queuedAt: queued.occurredAt,
          idempotent: true,
        });
      }

      const attempt = await client.query(
        `SELECT COALESCE(max(attempt_number), 0)::integer + 1 AS next_attempt
           FROM practice_submissions
          WHERE tenant_id=$1::uuid AND learner_id=$2::uuid AND practice_revision_id=$3::uuid`,
        [input.tenantId, input.learnerId, input.practiceRevisionId],
      );
      const submissionId = uuidV7(submittedAt.getTime());
      const eventId = uuidV7(submittedAt.getTime() + 1);
      await client.query(
        `INSERT INTO practice_submissions
           (id, tenant_id, learner_id, practice_revision_id, attempt_number, request_id, artifact, created_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::jsonb, $8)`,
        [submissionId, input.tenantId, input.learnerId, input.practiceRevisionId,
         Number(attempt.rows[0]?.next_attempt ?? 1), input.requestId, JSON.stringify(input.artifact), submittedAt],
      );
      await client.query(
        `INSERT INTO outbox_events
           (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, occurred_at, attempt_count)
         VALUES ($1::uuid, $2::uuid, 'practice_submission', $3, 'verification.requested', $4::jsonb, $5, 0)`,
        [eventId, input.tenantId, submissionId,
         JSON.stringify({ targetKind: "PRACTICE", submissionId }), submittedAt],
      );
      await client.query(
        `INSERT INTO audit_events
           (id, tenant_id, actor_type, actor_id, action, resource_type, resource_id, metadata, occurred_at)
         VALUES ($1::uuid, $2::uuid, 'HUMAN', $3, 'practice_submission.create', 'practice_submission', $4, $5::jsonb, $6)`,
        [uuidV7(submittedAt.getTime() + 2), input.tenantId, input.learnerId, submissionId,
         JSON.stringify({ practiceRevisionId: input.practiceRevisionId }), submittedAt],
      );
      await client.query("COMMIT");
      return Object.freeze({ submissionId, verificationRequestId: eventId, queuedAt: submittedAt, idempotent: false });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async assertEligible(client: PoolClient, tenantId: string, learnerId: string, revisionId: string): Promise<void> {
    const eligible = await client.query(
      `SELECT revision.id
         FROM practice_revisions revision
         JOIN practice_definitions practice
           ON practice.tenant_id=revision.tenant_id AND practice.id=revision.practice_id
         JOIN lesson_versions lesson
           ON lesson.tenant_id=practice.tenant_id AND lesson.id=practice.lesson_version_id
         JOIN chapter_versions chapter
           ON chapter.tenant_id=lesson.tenant_id AND chapter.id=lesson.chapter_version_id
        WHERE revision.tenant_id=$1::uuid AND revision.id=$3::uuid
          AND (
            EXISTS (
              SELECT 1 FROM enrollments enrollment
               WHERE enrollment.tenant_id=$1::uuid AND enrollment.learner_id=$2::uuid
                 AND enrollment.course_version_id=chapter.course_version_id
            )
            OR EXISTS (
              SELECT 1
                FROM cohort_memberships membership
                JOIN learning_assignments assignment
                  ON assignment.tenant_id=membership.tenant_id AND assignment.cohort_id=membership.cohort_id
               WHERE membership.tenant_id=$1::uuid AND membership.learner_id=$2::uuid
                 AND membership.status='ENROLLED' AND assignment.is_primary=true
                 AND assignment.course_version_id=chapter.course_version_id
            )
          )`,
      [tenantId, learnerId, revisionId],
    );
    if (!eligible.rows[0]) throw new PracticeSubmissionNotEligibleError();
  }

  private async findVerificationRequest(client: PoolClient, tenantId: string, submissionId: string): Promise<Readonly<{ id: string; occurredAt: Date }>> {
    const event = await client.query(
      `SELECT id, occurred_at FROM outbox_events
        WHERE tenant_id=$1::uuid AND aggregate_type='practice_submission'
          AND aggregate_id=$2 AND event_type='verification.requested'
        ORDER BY occurred_at ASC LIMIT 1`,
      [tenantId, submissionId],
    );
    if (!event.rows[0]) throw new Error("practice submission is missing its verification request event");
    return Object.freeze({ id: String(event.rows[0].id), occurredAt: new Date(String(event.rows[0].occurred_at)) });
  }
}
