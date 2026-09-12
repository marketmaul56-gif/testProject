import type { Pool, PoolClient } from "pg";
import { uuidV7 } from "../../../../platform/audit/src/security-audit.ts";
import type {
  AuthoritativeVerificationResult,
  SafeVerifierDiagnostic,
  VerificationAttemptRequest,
  VerificationAuthorityRepository,
} from "../application/authority.ts";

function asResult(row: Record<string, unknown>): AuthoritativeVerificationResult {
  return Object.freeze({
    id: String(row.id),
    attemptId: String(row.verification_attempt_id),
    tenantId: String(row.tenant_id),
    learnerId: String(row.learner_id),
    outcome: row.outcome as AuthoritativeVerificationResult["outcome"],
    diagnostic: row.diagnostic as SafeVerifierDiagnostic,
    completedAt: new Date(String(row.completed_at)),
  });
}

export class PgVerificationAuthority implements VerificationAuthorityRepository {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async createOrGetAttempt(request: VerificationAttemptRequest): Promise<Readonly<{ id: string }>> {
    const practiceSubmissionId = request.target.kind === "PRACTICE" ? request.target.submissionId : null;
    const projectSubmissionId = request.target.kind === "PROJECT" ? request.target.submissionId : null;
    await this.pool.query(
      `INSERT INTO verification_attempts
         (id, tenant_id, practice_submission_id, project_submission_id, status,
          verifier_key, verifier_version, request_id, created_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'PENDING', $5, $6, $7, $8)
       ON CONFLICT (tenant_id, request_id) DO NOTHING`,
      [request.id, request.tenantId, practiceSubmissionId, projectSubmissionId,
       request.verifierKey, request.verifierVersion, request.requestId, request.createdAt],
    );

    const result = await this.pool.query(
      `SELECT id, practice_submission_id, project_submission_id, verifier_key, verifier_version
         FROM verification_attempts
        WHERE tenant_id = $1::uuid AND request_id = $2`,
      [request.tenantId, request.requestId],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("verification attempt could not be created or loaded");
    const loadedKind = row.practice_submission_id ? "PRACTICE" : "PROJECT";
    const loadedSubmission = String(row.practice_submission_id ?? row.project_submission_id);
    if (loadedKind !== request.target.kind || loadedSubmission !== request.target.submissionId ||
        row.verifier_key !== request.verifierKey || row.verifier_version !== request.verifierVersion) {
      throw new Error("verification request id was reused for different authoritative input");
    }
    return Object.freeze({ id: String(row.id) });
  }

  async getResultForAttempt(attemptId: string): Promise<AuthoritativeVerificationResult | null> {
    const result = await this.pool.query(
      `SELECT id, verification_attempt_id, tenant_id, learner_id, outcome, diagnostic, completed_at
         FROM verification_results
        WHERE verification_attempt_id = $1::uuid`,
      [attemptId],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? asResult(row) : null;
  }

  async claimRunning(attemptId: string, startedAt: Date): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE verification_attempts
          SET status = 'RUNNING', started_at = COALESCE(started_at, $2)
        WHERE id = $1::uuid AND status = 'PENDING'
        RETURNING id`,
      [attemptId, startedAt],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async finalize(input: Readonly<{
    attemptId: string;
    outcome: AuthoritativeVerificationResult["outcome"];
    diagnostic: SafeVerifierDiagnostic;
    completedAt: Date;
  }>): Promise<AuthoritativeVerificationResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await this.getResultForAttemptWithClient(client, input.attemptId);
      if (existing) {
        await client.query("COMMIT");
        return existing;
      }

      const source = await client.query(
        `SELECT va.tenant_id,
                COALESCE(practice.learner_id, project.learner_id) AS learner_id,
                va.status
           FROM verification_attempts va
           LEFT JOIN practice_submissions practice ON practice.id = va.practice_submission_id
           LEFT JOIN project_submissions project ON project.id = va.project_submission_id
          WHERE va.id = $1::uuid
          FOR UPDATE OF va`,
        [input.attemptId],
      );
      const attempt = source.rows[0] as Record<string, unknown> | undefined;
      if (!attempt) throw new Error("verification attempt not found");
      if (attempt.status !== "RUNNING") throw new Error("verification attempt must be RUNNING before finalization");
      if (!attempt.learner_id) throw new Error("verification attempt source learner not found");

      await client.query(
        `UPDATE verification_attempts
            SET status = 'COMPLETED', completed_at = $2
          WHERE id = $1::uuid`,
        [input.attemptId, input.completedAt],
      );

      const resultId = uuidV7(input.completedAt.getTime());
      const inserted = await client.query(
        `INSERT INTO verification_results
           (id, tenant_id, verification_attempt_id, learner_id, outcome, diagnostic, completed_at, created_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::verification_outcome, $6::jsonb, $7, $7)
         RETURNING id, verification_attempt_id, tenant_id, learner_id, outcome, diagnostic, completed_at`,
        [resultId, attempt.tenant_id, input.attemptId, attempt.learner_id,
         input.outcome, JSON.stringify(input.diagnostic), input.completedAt],
      );
      const authoritative = asResult(inserted.rows[0] as Record<string, unknown>);

      if (input.outcome === "PASSED") {
        await client.query(
          `INSERT INTO outbox_events
             (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, occurred_at, attempt_count)
           VALUES ($1::uuid, $2::uuid, 'verification_result', $3, 'verification.passed', $4::jsonb, $5, 0)`,
          [uuidV7(input.completedAt.getTime()), authoritative.tenantId, authoritative.id,
           JSON.stringify({ verificationResultId: authoritative.id, attemptId: input.attemptId }), input.completedAt],
        );
      }

      await client.query("COMMIT");
      return authoritative;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async getResultForAttemptWithClient(client: PoolClient, attemptId: string): Promise<AuthoritativeVerificationResult | null> {
    const result = await client.query(
      `SELECT id, verification_attempt_id, tenant_id, learner_id, outcome, diagnostic, completed_at
         FROM verification_results
        WHERE verification_attempt_id = $1::uuid`,
      [attemptId],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? asResult(row) : null;
  }
}
