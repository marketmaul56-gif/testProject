import type { Pool } from "pg";
import { removeMembership, transitionCohort, type CohortStatus } from "../domain/lifecycle.ts";

export class CohortNotFoundError extends Error {
  constructor() {
    super("cohort not found");
    this.name = "CohortNotFoundError";
  }
}

export class CohortConcurrencyError extends Error {
  constructor() {
    super("cohort state changed; reload before retrying");
    this.name = "CohortConcurrencyError";
  }
}

export class PrimaryAssignmentConflictError extends Error {
  constructor() {
    super("cohort already has a different primary learning assignment");
    this.name = "PrimaryAssignmentConflictError";
  }
}

export type CohortRecord = Readonly<{
  id: string;
  tenantId: string;
  status: CohortStatus;
  version: number;
}>;

export type LearningAssignmentRecord = Readonly<{
  id: string;
  cohortId: string;
  courseVersionId: string;
  created: boolean;
}>;

export type MembershipOccurrence = Readonly<{
  id: string;
  cohortId: string;
  learnerId: string;
  status: "ENROLLED" | "REMOVED";
  enrolledAt: Date;
  removedAt: Date | null;
  created: boolean;
}>;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
}

export class PgCohortOperations {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async transition(input: Readonly<{
    tenantId: string;
    cohortId: string;
    expectedVersion: number;
    to: CohortStatus;
  }>): Promise<CohortRecord> {
    const currentResult = await this.pool.query(
      `SELECT id, tenant_id, status, version
         FROM cohorts
        WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [input.tenantId, input.cohortId],
    );
    const current = currentResult.rows[0] as Record<string, unknown> | undefined;
    if (!current) throw new CohortNotFoundError();
    if (Number(current.version) !== input.expectedVersion) throw new CohortConcurrencyError();

    const from = current.status as CohortStatus;
    transitionCohort(from, input.to);
    const updated = await this.pool.query(
      `UPDATE cohorts
          SET status = $4::cohort_status,
              version = version + 1,
              updated_at = now()
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
          AND version = $3
          AND status = $5::cohort_status
      RETURNING id, tenant_id, status, version`,
      [input.tenantId, input.cohortId, input.expectedVersion, input.to, from],
    );
    const row = updated.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new CohortConcurrencyError();
    return Object.freeze({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      status: row.status as CohortStatus,
      version: Number(row.version),
    });
  }

  async assignPrimaryLearning(input: Readonly<{
    id: string;
    tenantId: string;
    cohortId: string;
    courseVersionId: string;
    assignedAt: Date;
  }>): Promise<LearningAssignmentRecord> {
    const existing = await this.pool.query(
      `SELECT id, course_version_id
         FROM learning_assignments
        WHERE tenant_id = $1::uuid AND cohort_id = $2::uuid AND is_primary = true`,
      [input.tenantId, input.cohortId],
    );
    const current = existing.rows[0] as Record<string, unknown> | undefined;
    if (current) {
      if (String(current.course_version_id) !== input.courseVersionId) throw new PrimaryAssignmentConflictError();
      return Object.freeze({
        id: String(current.id),
        cohortId: input.cohortId,
        courseVersionId: input.courseVersionId,
        created: false,
      });
    }

    try {
      const inserted = await this.pool.query(
        `INSERT INTO learning_assignments
           (id, tenant_id, cohort_id, course_version_id, is_primary, assigned_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, true, $5)
         RETURNING id, cohort_id, course_version_id`,
        [input.id, input.tenantId, input.cohortId, input.courseVersionId, input.assignedAt],
      );
      const row = inserted.rows[0] as Record<string, unknown>;
      return Object.freeze({
        id: String(row.id),
        cohortId: String(row.cohort_id),
        courseVersionId: String(row.course_version_id),
        created: true,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await this.pool.query(
        `SELECT id, course_version_id
           FROM learning_assignments
          WHERE tenant_id = $1::uuid AND cohort_id = $2::uuid AND is_primary = true`,
        [input.tenantId, input.cohortId],
      );
      const row = raced.rows[0] as Record<string, unknown> | undefined;
      if (!row || String(row.course_version_id) !== input.courseVersionId) throw new PrimaryAssignmentConflictError();
      return Object.freeze({
        id: String(row.id),
        cohortId: input.cohortId,
        courseVersionId: input.courseVersionId,
        created: false,
      });
    }
  }

  async enrollLearner(input: Readonly<{
    id: string;
    tenantId: string;
    cohortId: string;
    learnerId: string;
    enrolledAt: Date;
  }>): Promise<MembershipOccurrence> {
    const inserted = await this.pool.query(
      `INSERT INTO cohort_memberships
         (id, tenant_id, cohort_id, learner_id, status, enrolled_at, removed_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'ENROLLED', $5, NULL)
       ON CONFLICT (tenant_id, cohort_id, learner_id) WHERE status = 'ENROLLED'
       DO NOTHING
       RETURNING id, cohort_id, learner_id, status, enrolled_at, removed_at`,
      [input.id, input.tenantId, input.cohortId, input.learnerId, input.enrolledAt],
    );
    if ((inserted.rowCount ?? 0) === 1) return this.asMembership(inserted.rows[0] as Record<string, unknown>, true);

    const existing = await this.pool.query(
      `SELECT id, cohort_id, learner_id, status, enrolled_at, removed_at
         FROM cohort_memberships
        WHERE tenant_id = $1::uuid
          AND cohort_id = $2::uuid
          AND learner_id = $3::uuid
          AND status = 'ENROLLED'`,
      [input.tenantId, input.cohortId, input.learnerId],
    );
    const row = existing.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("active cohort membership idempotency lookup failed");
    return this.asMembership(row, false);
  }

  async removeEnrollment(input: Readonly<{
    tenantId: string;
    membershipId: string;
    removedAt: Date;
  }>): Promise<MembershipOccurrence> {
    const removedStatus = removeMembership("ENROLLED");
    const updated = await this.pool.query(
      `UPDATE cohort_memberships
          SET status = $3::membership_status,
              removed_at = $4
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
          AND status = 'ENROLLED'
      RETURNING id, cohort_id, learner_id, status, enrolled_at, removed_at`,
      [input.tenantId, input.membershipId, removedStatus, input.removedAt],
    );
    if ((updated.rowCount ?? 0) === 1) return this.asMembership(updated.rows[0] as Record<string, unknown>, false);

    const existing = await this.pool.query(
      `SELECT id, cohort_id, learner_id, status, enrolled_at, removed_at
         FROM cohort_memberships
        WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [input.tenantId, input.membershipId],
    );
    const row = existing.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("cohort membership not found");
    if (row.status !== "REMOVED") throw new Error("cohort membership could not be removed");
    return this.asMembership(row, false);
  }

  private asMembership(row: Record<string, unknown>, created: boolean): MembershipOccurrence {
    return Object.freeze({
      id: String(row.id),
      cohortId: String(row.cohort_id),
      learnerId: String(row.learner_id),
      status: row.status as "ENROLLED" | "REMOVED",
      enrolledAt: new Date(String(row.enrolled_at)),
      removedAt: row.removed_at ? new Date(String(row.removed_at)) : null,
      created,
    });
  }
}
