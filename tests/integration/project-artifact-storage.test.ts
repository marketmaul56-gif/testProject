import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { LearnerProjectArtifactApplication } from "../../apps/api/src/project-artifact-application.ts";
import { PgProjectArtifactCommands } from "../../packages/modules/projects/src/infrastructure/pg-artifact-commands.ts";
import type { HumanPrincipal } from "../../packages/platform/auth/src/principal.ts";
import { AuthorizationDeniedError } from "../../packages/platform/auth/src/policy.ts";
import { S3ObjectStorage } from "../../packages/platform/storage/src/s3-object-storage.ts";

const ids = {
  tenant: "00000000-0000-7000-8000-000000000601",
  learner: "00000000-0000-7000-8000-000000000602",
  other: "00000000-0000-7000-8000-000000000603",
  course: "00000000-0000-7000-8000-000000000604",
  courseVersion: "00000000-0000-7000-8000-000000000605",
  project: "00000000-0000-7000-8000-000000000606",
  alignment: "00000000-0000-7000-8000-000000000607",
  enrollment: "00000000-0000-7000-8000-000000000608",
} as const;

function learner(memberId: string): HumanPrincipal {
  return Object.freeze({
    kind: "human",
    authUserId: `auth-${memberId}`,
    tenantId: ids.tenant,
    memberId,
    roles: Object.freeze(["LEARNER"] as const),
  });
}

test("project artifact is presigned, integrity checked, sealed and downloadable from S3-compatible storage", async () => {
  const databaseUrl = process.env.DATABASE_URL;
  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT;
  const bucket = process.env.OBJECT_STORAGE_BUCKET;
  const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
  assert.ok(databaseUrl && endpoint && bucket && accessKeyId && secretAccessKey, "integration environment is incomplete");

  const pool = new Pool({ connectionString: databaseUrl });
  const clientConfig = {
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  } as const;
  const admin = new S3Client(clientConfig);
  await admin.send(new CreateBucketCommand({ Bucket: bucket }));
  admin.destroy();

  const storage = new S3ObjectStorage({
    endpoint,
    region: "us-east-1",
    bucket,
    forcePathStyle: true,
    accessKeyId,
    secretAccessKey,
  });
  const application = new LearnerProjectArtifactApplication(new PgProjectArtifactCommands(pool), storage);
  const temp = await mkdtemp(join(tmpdir(), "m12-artifact-"));

  try {
    await pool.query(`
      INSERT INTO tenants (id, slug) VALUES ('${ids.tenant}', 'artifact-storage');
      INSERT INTO members (id, tenant_id, auth_user_id, display_name) VALUES
        ('${ids.learner}', '${ids.tenant}', 'artifact-learner', 'Artifact Learner'),
        ('${ids.other}', '${ids.tenant}', 'artifact-other', 'Other Learner');
      INSERT INTO member_roles (tenant_id, member_id, role) VALUES
        ('${ids.tenant}', '${ids.learner}', 'LEARNER'),
        ('${ids.tenant}', '${ids.other}', 'LEARNER');
      INSERT INTO courses (id, tenant_id, key) VALUES ('${ids.course}', '${ids.tenant}', 'artifact-course');
      INSERT INTO course_versions (id, tenant_id, course_id, version, status, title, published_at)
        VALUES ('${ids.courseVersion}', '${ids.tenant}', '${ids.course}', 1, 'PUBLISHED', 'Artifact Course', now());
      INSERT INTO enrollments (id, tenant_id, learner_id, course_version_id)
        VALUES ('${ids.enrollment}', '${ids.tenant}', '${ids.learner}', '${ids.courseVersion}');
      INSERT INTO project_definitions (id, tenant_id, key, title)
        VALUES ('${ids.project}', '${ids.tenant}', 'artifact-project', 'Artifact Project');
      INSERT INTO project_learning_alignments (id, tenant_id, course_version_id, project_definition_id, position)
        VALUES ('${ids.alignment}', '${ids.tenant}', '${ids.courseVersion}', '${ids.project}', 1);
    `);

    const content = Buffer.from("export const verifiedProjectArtifact = 42;\n", "utf8");
    const contentHash = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    const intent = await application.createUploadIntent(learner(ids.learner), ids.project, {
      contentType: "text/plain",
      contentLength: content.byteLength,
      contentHash,
    });
    assert.equal(intent.method, "PUT");
    assert.equal(intent.revisionNumber, 1);
    assert.equal(intent.requiredHeaders["x-amz-meta-content-hash"], contentHash);

    const uploaded = await fetch(intent.uploadUrl, {
      method: "PUT",
      headers: intent.requiredHeaders,
      body: content,
    });
    assert.equal(uploaded.ok, true, await uploaded.text());

    const sealed = await application.sealRevision(learner(ids.learner), intent.artifactRevisionId);
    assert.equal(sealed.status, "SEALED");
    const sealedAgain = await application.sealRevision(learner(ids.learner), intent.artifactRevisionId);
    assert.equal(sealedAgain.sealedAt, sealed.sealedAt);

    const persisted = await pool.query(
      `SELECT object_key, content_hash, content_type, content_length, sealed_at
         FROM artifact_revisions WHERE tenant_id=$1::uuid AND id=$2::uuid`,
      [ids.tenant, intent.artifactRevisionId],
    );
    assert.equal(persisted.rows[0]?.content_hash, contentHash);
    assert.equal(persisted.rows[0]?.content_type, "text/plain");
    assert.equal(Number(persisted.rows[0]?.content_length), content.byteLength);
    assert.ok(persisted.rows[0]?.sealed_at);

    const target = join(temp, "downloaded-artifact");
    await storage.downloadToFile(String(persisted.rows[0]?.object_key), target, 1024 * 1024);
    assert.deepEqual(await readFile(target), content);

    await assert.rejects(
      () => application.createUploadIntent(learner(ids.other), ids.project, {
        contentType: "text/plain",
        contentLength: content.byteLength,
        contentHash,
      }),
      AuthorizationDeniedError,
    );
  } finally {
    storage.destroy();
    await pool.end();
    await rm(temp, { recursive: true, force: true });
  }
});
