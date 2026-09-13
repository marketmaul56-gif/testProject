import type { Pool } from "pg";

export type CreateGuidanceInput = Readonly<{
  id: string;
  tenantId: string;
  cohortId: string;
  instructorId: string;
  learnerId: string;
  message: string;
  createdAt: Date;
}>;

export class PgGuidanceWriter {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async create(input: CreateGuidanceInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO instructor_guidance
         (id, tenant_id, cohort_id, instructor_id, learner_id, message, created_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7)`,
      [
        input.id,
        input.tenantId,
        input.cohortId,
        input.instructorId,
        input.learnerId,
        input.message,
        input.createdAt,
      ],
    );
  }
}
