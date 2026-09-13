import type { Pool, PoolClient } from "pg";
import { uuidV7 } from "../../../../platform/audit/src/security-audit.ts";

export class ProjectSubmissionNotEligibleError extends Error {
  constructor() {
    super("artifact revision is not available to this learner");
    this.name = "ProjectSubmissionNotEligibleError";
  }
}

export class ProjectSubmissionConflictError extends Error {
  constructor() {
    super("submission request id was reused with different input");
    this.name = "ProjectSubmissionConflictError";
  }
}

export type QueuedProjectSubmission = Readonly<{
  submissionId: string;
  verificationRequestId: string;
  queuedAt: Date;
  idempotent: boolean;
}>;

export class PgProjectSubmissionCommands {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async submit(input: Readonly<{
    tenantId: string;
    learnerId: string;
    artifactRevisionId: string;
    requestId: string;
    submittedAt?: Date;
  }>): Promise<QueuedProjectSubmission> {
    const submittedAt = input.submittedAt ?? new Date();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`project:${input.tenantId}:${input.learnerId}:${input.requestId}`],
      );
      await this.assertEligible(client, input.tenantId, input.learnerId, input.artifactRevisionId);

      const existing = await client.query(
        `SELECT id, artifact_revision_id, created_at
           FROM project_submissions
          WHERE tenant_id=$1::uuid AND learner_id=$2::uuid AND request_id=$3
          ORDER BY created_at ASC LIMIT 1`,
        [input.tenantId, input.learnerId, input.requestId],
      );
      if (existing.rows[0]) {
        if (String(existing.rows[0].artifact_revision_id) !== input.artifactRevisionId) {
          throw new ProjectSubmissionConflictError();
        }
        const queued = await this.findVerificationRequest(client, input.tenantId, String(existing.rows[0].id));
        await client.query("COMMIT");
        return Object.freeze({
          submissionId: String(existing.rows[0].id),
          verificationRequestId: queued.id,
          queuedAt: queued.occurredAt,
          idempotent: true,
        });
      }

      const submissionId = uuidV7(submittedAt.getTime());
      const eventId = uuidV7(submittedAt.getTime() + 1);
      await client.query(
        `INSERT INTO project_submissions
           (id, tenant_id, learner_id, artifact_revision_id, request_id, created_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6)`,
        [submissionId, input.tenantId, input.learnerId, input.artifactRevisionId, input.requestId, submittedAt],
      );
      await client.query(
        `INSERT INTO outbox_events
           (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, occurred_at, attempt_count)
         VALUES ($1::uuid, $2::uuid, 'project_submission', $3, 'verification.requested', $4::jsonb, $5, 0)`,
        [eventId, input.tenantId, submissionId,
         JSON.stringify({ targetKind: "PROJECT", submissionId }), submittedAt],
      );
      await client.query(
        `INSERT INTO audit_events
           (id, tenant_id, actor_type, actor_id, action, resource_type, resource_id, metadata, occurred_at)
         VALUES ($1::uuid, $2::uuid, 'HUMAN', $3, 'project_submission.create', 'project_submission', $4, $5::jsonb, $6)`,
        [uuidV7(submittedAt.getTime() + 2), input.tenantId, input.learnerId, submissionId,
         JSON.stringify({ artifactRevisionId: input.artifactRevisionId }), submittedAt],
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
         FROM artifact_revisions revision
         JOIN project_artifacts artifact
           ON artifact.tenant_id=revision.tenant_id AND artifact.id=revision.artifact_id
         JOIN project_learning_alignments alignment
           ON alignment.tenant_id=artifact.tenant_id AND alignment.project_definition_id=artifact.project_definition_id
        WHERE revision.tenant_id=$1::uuid AND revision.id=$3::uuid
          AND artifact.learner_id=$2::uuid AND revision.sealed_at IS NOT NULL
          AND (
            EXISTS (
              SELECT 1 FROM enrollments enrollment
               WHERE enrollment.tenant_id=$1::uuid AND enrollment.learner_id=$2::uuid
                 AND enrollment.course_version_id=alignment.course_version_id
            )
            OR EXISTS (
              SELECT 1
                FROM cohort_memberships membership
                JOIN learning_assignments assignment
                  ON assignment.tenant_id=membership.tenant_id AND assignment.cohort_id=membership.cohort_id
               WHERE membership.tenant_id=$1::uuid AND membership.learner_id=$2::uuid
                 AND membership.status='ENROLLED' AND assignment.is_primary=true
                 AND assignment.course_version_id=alignment.course_version_id
            )
          )`,
      [tenantId, learnerId, revisionId],
    );
    if (!eligible.rows[0]) throw new ProjectSubmissionNotEligibleError();
  }

  private async findVerificationRequest(client: PoolClient, tenantId: string, submissionId: string): Promise<Readonly<{ id: string; occurredAt: Date }>> {
    const event = await client.query(
      `SELECT id, occurred_at FROM outbox_events
        WHERE tenant_id=$1::uuid AND aggregate_type='project_submission'
          AND aggregate_id=$2 AND event_type='verification.requested'
        ORDER BY occurred_at ASC LIMIT 1`,
      [tenantId, submissionId],
    );
    if (!event.rows[0]) throw new Error("project submission is missing its verification request event");
    return Object.freeze({ id: String(event.rows[0].id), occurredAt: new Date(String(event.rows[0].occurred_at)) });
  }
}
