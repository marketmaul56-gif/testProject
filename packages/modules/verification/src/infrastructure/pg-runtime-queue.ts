import type { Pool } from "pg";
import { uuidV7 } from "../../../../platform/audit/src/security-audit.ts";
import type { VerificationAttemptRequest } from "../application/authority.ts";

export type RuntimeVerificationEvent = Readonly<{
  eventId: string;
  tenantId: string;
  aggregateType: "practice_submission" | "project_submission";
  submissionId: string;
  occurredAt: Date;
  attemptCount: number;
}>;

export type PreparedRuntimeVerification = Readonly<VerificationAttemptRequest & {
  artifactRef: string;
  hiddenTestBundleRef: string;
}>;

export class PgRuntimeVerificationQueue {
  private readonly pool: Pool;
  private readonly maxAttempts: number;

  constructor(pool: Pool, maxAttempts = 5) {
    this.pool = pool;
    this.maxAttempts = maxAttempts;
  }

  async listVerificationRequests(limit = 20): Promise<readonly RuntimeVerificationEvent[]> {
    const result = await this.pool.query(
      `SELECT id, tenant_id, aggregate_type, aggregate_id, occurred_at, attempt_count
         FROM outbox_events
        WHERE published_at IS NULL AND event_type='verification.requested'
          AND attempt_count < $1
        ORDER BY occurred_at ASC, id ASC
        LIMIT $2`,
      [this.maxAttempts, limit],
    );
    return Object.freeze(result.rows.map((row: Record<string, unknown>) => this.mapVerificationEvent(row)));
  }

  async getVerificationRequest(eventId: string): Promise<RuntimeVerificationEvent | null> {
    const result = await this.pool.query(
      `SELECT id, tenant_id, aggregate_type, aggregate_id, occurred_at, attempt_count
         FROM outbox_events
        WHERE id=$2::uuid AND published_at IS NULL AND event_type='verification.requested'
          AND attempt_count < $1`,
      [this.maxAttempts, eventId],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? this.mapVerificationEvent(row) : null;
  }

  async prepare(event: RuntimeVerificationEvent): Promise<PreparedRuntimeVerification> {
    return event.aggregateType === "practice_submission"
      ? this.preparePractice(event)
      : this.prepareProject(event);
  }

  async listPassedEvents(limit = 20): Promise<readonly string[]> {
    const result = await this.pool.query(
      `SELECT id FROM outbox_events
        WHERE published_at IS NULL AND event_type='verification.passed'
          AND attempt_count < $1
        ORDER BY occurred_at ASC, id ASC
        LIMIT $2`,
      [this.maxAttempts, limit],
    );
    return Object.freeze(result.rows.map((row: Record<string, unknown>) => String(row.id)));
  }

  async markVerificationRequestProcessed(eventId: string, processedAt = new Date()): Promise<void> {
    await this.pool.query(
      `UPDATE outbox_events
          SET published_at=COALESCE(published_at, $2), attempt_count=attempt_count + CASE WHEN published_at IS NULL THEN 1 ELSE 0 END
        WHERE id=$1::uuid AND event_type='verification.requested'`,
      [eventId, processedAt],
    );
  }

  async noteDeliveryFailure(eventId: string): Promise<void> {
    await this.pool.query(
      `UPDATE outbox_events SET attempt_count=attempt_count + 1
        WHERE id=$1::uuid AND published_at IS NULL`,
      [eventId],
    );
  }

  private mapVerificationEvent(row: Record<string, unknown>): RuntimeVerificationEvent {
    return Object.freeze({
      eventId: String(row.id),
      tenantId: String(row.tenant_id),
      aggregateType: row.aggregate_type as RuntimeVerificationEvent["aggregateType"],
      submissionId: String(row.aggregate_id),
      occurredAt: new Date(String(row.occurred_at)),
      attemptCount: Number(row.attempt_count),
    });
  }

  private async preparePractice(event: RuntimeVerificationEvent): Promise<PreparedRuntimeVerification> {
    const result = await this.pool.query(
      `SELECT submission.artifact,
              profile.verifier_key, profile.verifier_version, profile.hidden_test_bundle_ref
         FROM practice_submissions submission
         JOIN verification_profiles profile
           ON profile.tenant_id=submission.tenant_id
          AND profile.target_type='PRACTICE_REVISION'
          AND profile.target_id=submission.practice_revision_id
        WHERE submission.tenant_id=$1::uuid AND submission.id=$2::uuid`,
      [event.tenantId, event.submissionId],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("practice verification profile or submission is unavailable");
    const encodedArtifact = Buffer.from(JSON.stringify(row.artifact), "utf8").toString("base64");
    if (encodedArtifact.length > 350_000) throw new Error("practice artifact exceeds runtime dispatch limit");
    return Object.freeze({
      id: uuidV7(),
      requestId: `outbox:${event.eventId}`,
      tenantId: event.tenantId,
      target: Object.freeze({ kind: "PRACTICE" as const, submissionId: event.submissionId }),
      verifierKey: String(row.verifier_key),
      verifierVersion: String(row.verifier_version),
      createdAt: event.occurredAt,
      artifactRef: `data:application/json;base64,${encodedArtifact}`,
      hiddenTestBundleRef: String(row.hidden_test_bundle_ref),
    });
  }

  private async prepareProject(event: RuntimeVerificationEvent): Promise<PreparedRuntimeVerification> {
    const result = await this.pool.query(
      `SELECT revision.object_key, revision.content_hash,
              profile.verifier_key, profile.verifier_version, profile.hidden_test_bundle_ref
         FROM project_submissions submission
         JOIN artifact_revisions revision
           ON revision.tenant_id=submission.tenant_id AND revision.id=submission.artifact_revision_id
         JOIN project_artifacts artifact
           ON artifact.tenant_id=revision.tenant_id AND artifact.id=revision.artifact_id
         JOIN verification_profiles profile
           ON profile.tenant_id=artifact.tenant_id
          AND profile.target_type='PROJECT_DEFINITION'
          AND profile.target_id=artifact.project_definition_id
        WHERE submission.tenant_id=$1::uuid AND submission.id=$2::uuid`,
      [event.tenantId, event.submissionId],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("project verification profile or submission is unavailable");
    const objectKey = String(row.object_key);
    const artifactRef = /^(data:|file:|https?:\/\/)/.test(objectKey)
      ? objectKey
      : `object://${encodeURIComponent(objectKey)}?sha256=${encodeURIComponent(String(row.content_hash))}`;
    return Object.freeze({
      id: uuidV7(),
      requestId: `outbox:${event.eventId}`,
      tenantId: event.tenantId,
      target: Object.freeze({ kind: "PROJECT" as const, submissionId: event.submissionId }),
      verifierKey: String(row.verifier_key),
      verifierVersion: String(row.verifier_version),
      createdAt: event.occurredAt,
      artifactRef,
      hiddenTestBundleRef: String(row.hidden_test_bundle_ref),
    });
  }
}
