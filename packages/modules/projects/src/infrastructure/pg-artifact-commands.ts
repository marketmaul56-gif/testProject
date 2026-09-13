import type { Pool, PoolClient } from "pg";
import { uuidV7 } from "../../../../platform/audit/src/security-audit.ts";

export class ProjectArtifactNotEligibleError extends Error {
  constructor() {
    super("learner is not assigned to this project");
    this.name = "ProjectArtifactNotEligibleError";
  }
}

export type ProjectArtifactUploadIntent = Readonly<{
  artifactId: string;
  artifactRevisionId: string;
  revisionNumber: number;
  objectKey: string;
  contentHash: string;
  contentType: string;
  contentLength: number;
}>;

export type ProjectArtifactRevisionForSeal = Readonly<{
  artifactRevisionId: string;
  objectKey: string;
  contentHash: string;
  contentType: string;
  contentLength: number;
  sealedAt: Date | null;
}>;

export class PgProjectArtifactCommands {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async createUploadIntent(input: Readonly<{
    tenantId: string;
    learnerId: string;
    projectDefinitionId: string;
    contentHash: string;
    contentType: string;
    contentLength: number;
    createdAt?: Date;
  }>): Promise<ProjectArtifactUploadIntent> {
    const createdAt = input.createdAt ?? new Date();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`artifact:${input.tenantId}:${input.learnerId}:${input.projectDefinitionId}`],
      );
      await this.assertEligible(client, input.tenantId, input.learnerId, input.projectDefinitionId);

      const artifactResult = await client.query(
        `SELECT id FROM project_artifacts
          WHERE tenant_id=$1::uuid AND learner_id=$2::uuid AND project_definition_id=$3::uuid
          ORDER BY created_at ASC LIMIT 1`,
        [input.tenantId, input.learnerId, input.projectDefinitionId],
      );
      const artifactId = artifactResult.rows[0]
        ? String(artifactResult.rows[0].id)
        : uuidV7(createdAt.getTime());
      if (!artifactResult.rows[0]) {
        await client.query(
          `INSERT INTO project_artifacts (id, tenant_id, learner_id, project_definition_id, created_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)`,
          [artifactId, input.tenantId, input.learnerId, input.projectDefinitionId, createdAt],
        );
      }

      const revisionNumberResult = await client.query(
        `SELECT COALESCE(MAX(revision_number), 0) + 1 AS next_revision
           FROM artifact_revisions
          WHERE tenant_id=$1::uuid AND artifact_id=$2::uuid`,
        [input.tenantId, artifactId],
      );
      const revisionNumber = Number(revisionNumberResult.rows[0].next_revision);
      const artifactRevisionId = uuidV7(createdAt.getTime() + 1);
      const objectKey = `tenant/${input.tenantId}/projects/${input.projectDefinitionId}/learners/${input.learnerId}/artifacts/${artifactId}/revisions/${artifactRevisionId}`;
      await client.query(
        `INSERT INTO artifact_revisions
           (id, tenant_id, artifact_id, revision_number, object_key, content_hash, content_type, content_length, created_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9)`,
        [artifactRevisionId, input.tenantId, artifactId, revisionNumber, objectKey,
         input.contentHash, input.contentType, input.contentLength, createdAt],
      );
      await client.query(
        `INSERT INTO audit_events
           (id, tenant_id, actor_type, actor_id, action, resource_type, resource_id, metadata, occurred_at)
         VALUES ($1::uuid, $2::uuid, 'HUMAN', $3, 'project_artifact.upload_intent', 'artifact_revision', $4,
                 $5::jsonb, $6)`,
        [uuidV7(createdAt.getTime() + 2), input.tenantId, input.learnerId, artifactRevisionId,
         JSON.stringify({ projectDefinitionId: input.projectDefinitionId, contentLength: input.contentLength }), createdAt],
      );
      await client.query("COMMIT");
      return Object.freeze({ artifactId, artifactRevisionId, revisionNumber, objectKey,
        contentHash: input.contentHash, contentType: input.contentType, contentLength: input.contentLength });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findRevisionForSeal(input: Readonly<{ tenantId: string; learnerId: string; artifactRevisionId: string }>): Promise<ProjectArtifactRevisionForSeal> {
    const result = await this.pool.query(
      `SELECT revision.id, revision.object_key, revision.content_hash, revision.content_type,
              revision.content_length, revision.sealed_at
         FROM artifact_revisions revision
         JOIN project_artifacts artifact
           ON artifact.tenant_id=revision.tenant_id AND artifact.id=revision.artifact_id
        WHERE revision.tenant_id=$1::uuid AND revision.id=$3::uuid AND artifact.learner_id=$2::uuid`,
      [input.tenantId, input.learnerId, input.artifactRevisionId],
    );
    const row = result.rows[0];
    if (!row || !row.content_type || row.content_length === null) throw new ProjectArtifactNotEligibleError();
    return Object.freeze({
      artifactRevisionId: String(row.id),
      objectKey: String(row.object_key),
      contentHash: String(row.content_hash),
      contentType: String(row.content_type),
      contentLength: Number(row.content_length),
      sealedAt: row.sealed_at ? new Date(String(row.sealed_at)) : null,
    });
  }

  async sealRevision(input: Readonly<{ tenantId: string; learnerId: string; artifactRevisionId: string; sealedAt?: Date }>): Promise<Date> {
    const sealedAt = input.sealedAt ?? new Date();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE artifact_revisions revision
            SET sealed_at=COALESCE(revision.sealed_at, $4)
           FROM project_artifacts artifact
          WHERE revision.tenant_id=$1::uuid AND revision.id=$3::uuid
            AND artifact.tenant_id=revision.tenant_id AND artifact.id=revision.artifact_id
            AND artifact.learner_id=$2::uuid
          RETURNING revision.sealed_at`,
        [input.tenantId, input.learnerId, input.artifactRevisionId, sealedAt],
      );
      if (!result.rows[0]) throw new ProjectArtifactNotEligibleError();
      const effective = new Date(String(result.rows[0].sealed_at));
      await client.query(
        `INSERT INTO audit_events
           (id, tenant_id, actor_type, actor_id, action, resource_type, resource_id, occurred_at)
         VALUES ($1::uuid, $2::uuid, 'HUMAN', $3, 'project_artifact.seal', 'artifact_revision', $4, $5)`,
        [uuidV7(sealedAt.getTime()), input.tenantId, input.learnerId, input.artifactRevisionId, sealedAt],
      );
      await client.query("COMMIT");
      return effective;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async assertEligible(client: PoolClient, tenantId: string, learnerId: string, projectDefinitionId: string): Promise<void> {
    const eligible = await client.query(
      `SELECT 1
         FROM project_learning_alignments alignment
        WHERE alignment.tenant_id=$1::uuid AND alignment.project_definition_id=$3::uuid
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
          ) LIMIT 1`,
      [tenantId, learnerId, projectDefinitionId],
    );
    if (!eligible.rows[0]) throw new ProjectArtifactNotEligibleError();
  }
}
