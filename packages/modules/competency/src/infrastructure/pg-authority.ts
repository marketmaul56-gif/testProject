import type { Pool, PoolClient } from "pg";
import { uuidV7 } from "../../../platform/audit/src/security-audit.ts";
import { issueEvidenceFromVerification } from "../domain/evidence.ts";

export type EvidenceProjectionProcessResult = Readonly<{
  eventId: string;
  verificationResultId: string;
  evidenceIds: readonly string[];
  skillIds: readonly string[];
  alreadyProcessed: boolean;
}>;

export class PgCompetencyAuthority {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async processPassedVerificationEvent(eventId: string, processedAt = new Date()): Promise<EvidenceProjectionProcessResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const eventResult = await client.query(
        `SELECT id, tenant_id, aggregate_id, event_type, payload, published_at
           FROM outbox_events
          WHERE id = $1::uuid
          FOR UPDATE`,
        [eventId],
      );
      const event = eventResult.rows[0] as Record<string, unknown> | undefined;
      if (!event) throw new Error("authority outbox event not found");
      if (event.event_type !== "verification.passed") throw new Error("unsupported authority event type");
      const payload = event.payload as { verificationResultId?: unknown };
      const verificationResultId = String(payload.verificationResultId ?? event.aggregate_id);
      if (event.published_at) {
        const existing = await client.query(
          `SELECT id, skill_id FROM skill_evidence
            WHERE tenant_id = $1::uuid AND verification_result_id = $2::uuid
            ORDER BY skill_id`,
          [event.tenant_id, verificationResultId],
        );
        await client.query("COMMIT");
        return Object.freeze({
          eventId,
          verificationResultId,
          evidenceIds: Object.freeze(existing.rows.map((row: Record<string, unknown>) => String(row.id))),
          skillIds: Object.freeze(existing.rows.map((row: Record<string, unknown>) => String(row.skill_id))),
          alreadyProcessed: true,
        });
      }

      const verificationResult = await client.query(
        `SELECT vr.id, vr.tenant_id, vr.learner_id, vr.outcome, vr.completed_at,
                va.verifier_key, va.verifier_version,
                va.practice_submission_id, va.project_submission_id
           FROM verification_results vr
           JOIN verification_attempts va ON va.id = vr.verification_attempt_id
          WHERE vr.id = $1::uuid AND vr.tenant_id = $2::uuid`,
        [verificationResultId, event.tenant_id],
      );
      const verification = verificationResult.rows[0] as Record<string, unknown> | undefined;
      if (!verification || verification.outcome !== "PASSED") {
        throw new Error("evidence issuance requires PASSED authoritative verification");
      }

      const skillIds = await this.resolveSkillIds(client, verification);
      if (skillIds.length === 0) throw new Error("PASSED verification has no authoritative skill alignment");

      const evidenceIds: string[] = [];
      for (const [index, skillId] of skillIds.entries()) {
        const evidence = issueEvidenceFromVerification(
          {
            id: String(verification.id),
            tenantId: String(verification.tenant_id),
            learnerId: String(verification.learner_id),
            status: "PASSED",
            verifierKey: String(verification.verifier_key),
            verifierVersion: String(verification.verifier_version),
            completedAt: new Date(String(verification.completed_at)).toISOString(),
          },
          {
            evidenceId: uuidV7(processedAt.getTime() + index),
            skillId,
            issuedAt: processedAt.toISOString(),
          },
        );
        const inserted = await client.query(
          `INSERT INTO skill_evidence
             (id, tenant_id, learner_id, skill_id, verification_result_id, issued_at, created_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $6)
           ON CONFLICT (tenant_id, verification_result_id, skill_id) DO NOTHING
           RETURNING id`,
          [evidence.id, evidence.tenantId, evidence.learnerId, evidence.skillId,
           evidence.verificationResultId, processedAt],
        );
        const evidenceId = inserted.rows[0]?.id
          ? String(inserted.rows[0].id)
          : await this.existingEvidenceId(client, evidence.tenantId, evidence.verificationResultId, evidence.skillId);
        evidenceIds.push(evidenceId);
        await this.projectSkill(client, evidence.tenantId, evidence.learnerId, evidence.skillId, processedAt);
      }

      await client.query(
        `UPDATE outbox_events
            SET published_at = $2, attempt_count = attempt_count + 1
          WHERE id = $1::uuid`,
        [eventId, processedAt],
      );
      await client.query("COMMIT");
      return Object.freeze({
        eventId,
        verificationResultId,
        evidenceIds: Object.freeze(evidenceIds),
        skillIds: Object.freeze(skillIds),
        alreadyProcessed: false,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async rebuildLearnerProjection(tenantId: string, learnerId: string, projectedAt = new Date()): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const rows = await client.query(
        `SELECT skill_id, count(*)::integer AS evidence_count
           FROM skill_evidence
          WHERE tenant_id = $1::uuid AND learner_id = $2::uuid
          GROUP BY skill_id
          ORDER BY skill_id`,
        [tenantId, learnerId],
      );
      for (const row of rows.rows as Record<string, unknown>[]) {
        await this.upsertProjection(
          client,
          tenantId,
          learnerId,
          String(row.skill_id),
          Number(row.evidence_count),
          projectedAt,
        );
      }
      await client.query("COMMIT");
      return rows.rowCount ?? 0;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async resolveSkillIds(client: PoolClient, verification: Record<string, unknown>): Promise<string[]> {
    if (verification.practice_submission_id) {
      const result = await client.query(
        `SELECT revision.skill_id
           FROM practice_submissions submission
           JOIN practice_revisions revision ON revision.id = submission.practice_revision_id
          WHERE submission.id = $1::uuid AND submission.tenant_id = $2::uuid`,
        [verification.practice_submission_id, verification.tenant_id],
      );
      return result.rows.map((row: Record<string, unknown>) => String(row.skill_id));
    }
    if (verification.project_submission_id) {
      const result = await client.query(
        `SELECT alignment.skill_id
           FROM project_submissions submission
           JOIN artifact_revisions revision ON revision.id = submission.artifact_revision_id
           JOIN project_artifacts artifact ON artifact.id = revision.artifact_id
           JOIN project_skill_alignments alignment
             ON alignment.tenant_id = submission.tenant_id
            AND alignment.project_definition_id = artifact.project_definition_id
          WHERE submission.id = $1::uuid AND submission.tenant_id = $2::uuid
          ORDER BY alignment.skill_id`,
        [verification.project_submission_id, verification.tenant_id],
      );
      return result.rows.map((row: Record<string, unknown>) => String(row.skill_id));
    }
    throw new Error("verification lacks canonical submission target");
  }

  private async existingEvidenceId(client: PoolClient, tenantId: string, resultId: string, skillId: string): Promise<string> {
    const existing = await client.query(
      `SELECT id FROM skill_evidence
        WHERE tenant_id = $1::uuid AND verification_result_id = $2::uuid AND skill_id = $3::uuid`,
      [tenantId, resultId, skillId],
    );
    if (!existing.rows[0]) throw new Error("idempotent evidence lookup failed");
    return String(existing.rows[0].id);
  }

  private async projectSkill(client: PoolClient, tenantId: string, learnerId: string, skillId: string, projectedAt: Date): Promise<void> {
    const count = await client.query(
      `SELECT count(*)::integer AS evidence_count
         FROM skill_evidence
        WHERE tenant_id = $1::uuid AND learner_id = $2::uuid AND skill_id = $3::uuid`,
      [tenantId, learnerId, skillId],
    );
    await this.upsertProjection(client, tenantId, learnerId, skillId, Number(count.rows[0].evidence_count), projectedAt);
  }

  private async upsertProjection(
    client: PoolClient,
    tenantId: string,
    learnerId: string,
    skillId: string,
    evidenceCount: number,
    projectedAt: Date,
  ): Promise<void> {
    const status = evidenceCount > 0 ? "EVIDENCED" : "NOT_YET_EVIDENCED";
    await client.query(
      `INSERT INTO competency_states
         (id, tenant_id, learner_id, skill_id, status, evidence_count, projected_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::competency_projection_status, $6, $7)
       ON CONFLICT (tenant_id, learner_id, skill_id)
       DO UPDATE SET status = EXCLUDED.status,
                     evidence_count = EXCLUDED.evidence_count,
                     projected_at = EXCLUDED.projected_at`,
      [uuidV7(projectedAt.getTime()), tenantId, learnerId, skillId, status, evidenceCount, projectedAt],
    );
  }
}
