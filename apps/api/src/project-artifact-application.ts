import {
  projectArtifactSealResponseSchema,
  projectArtifactUploadRequestSchema,
  projectArtifactUploadResponseSchema,
  type ProjectArtifactSealResponse,
  type ProjectArtifactUploadResponse,
} from "@skill-platform/contracts/project-artifacts";
import {
  PgProjectArtifactCommands,
  ProjectArtifactNotEligibleError,
} from "../../../packages/modules/projects/src/infrastructure/pg-artifact-commands.ts";
import type { HumanPrincipal } from "../../../packages/platform/auth/src/principal.ts";
import { assertAuthorized, AuthorizationDeniedError } from "../../../packages/platform/auth/src/policy.ts";
import { S3ObjectStorage } from "../../../packages/platform/storage/src/s3-object-storage.ts";

export class ArtifactStorageUnavailableError extends Error {
  constructor() {
    super("project artifact storage is unavailable");
    this.name = "ArtifactStorageUnavailableError";
  }
}

export class LearnerProjectArtifactApplication {
  private readonly commands: PgProjectArtifactCommands;
  private readonly storage: S3ObjectStorage | null;

  constructor(commands: PgProjectArtifactCommands, storage: S3ObjectStorage | null) {
    this.commands = commands;
    this.storage = storage;
  }

  async createUploadIntent(
    principal: HumanPrincipal | undefined,
    projectDefinitionId: string,
    rawBody: unknown,
  ): Promise<ProjectArtifactUploadResponse> {
    const learner = this.requireLearner(principal);
    const input = projectArtifactUploadRequestSchema.parse(rawBody);
    assertAuthorized(learner, "submission:create", { tenantId: learner.tenantId, ownerMemberId: learner.memberId });
    const storage = this.requireStorage();
    try {
      const intent = await this.commands.createUploadIntent({
        tenantId: learner.tenantId,
        learnerId: learner.memberId,
        projectDefinitionId,
        contentHash: input.contentHash,
        contentType: input.contentType,
        contentLength: input.contentLength,
      });
      const upload = await storage.presignUpload(intent);
      return projectArtifactUploadResponseSchema.parse({
        artifactId: intent.artifactId,
        artifactRevisionId: intent.artifactRevisionId,
        revisionNumber: intent.revisionNumber,
        uploadUrl: upload.url,
        method: "PUT",
        requiredHeaders: upload.requiredHeaders,
        expiresAt: upload.expiresAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof ProjectArtifactNotEligibleError) {
        throw new AuthorizationDeniedError("learner is not assigned to this project");
      }
      throw error;
    }
  }

  async sealRevision(
    principal: HumanPrincipal | undefined,
    artifactRevisionId: string,
  ): Promise<ProjectArtifactSealResponse> {
    const learner = this.requireLearner(principal);
    assertAuthorized(learner, "submission:create", { tenantId: learner.tenantId, ownerMemberId: learner.memberId });
    const storage = this.requireStorage();
    try {
      const revision = await this.commands.findRevisionForSeal({
        tenantId: learner.tenantId,
        learnerId: learner.memberId,
        artifactRevisionId,
      });
      if (!revision.sealedAt) {
        await storage.assertUploadedObject({
          objectKey: revision.objectKey,
          contentType: revision.contentType,
          contentLength: revision.contentLength,
          contentHash: revision.contentHash,
        });
      }
      const sealedAt = revision.sealedAt ?? await this.commands.sealRevision({
        tenantId: learner.tenantId,
        learnerId: learner.memberId,
        artifactRevisionId,
      });
      return projectArtifactSealResponseSchema.parse({
        artifactRevisionId,
        sealedAt: sealedAt.toISOString(),
        status: "SEALED",
      });
    } catch (error) {
      if (error instanceof ProjectArtifactNotEligibleError) {
        throw new AuthorizationDeniedError("artifact revision is not available to this learner");
      }
      throw error;
    }
  }

  private requireStorage(): S3ObjectStorage {
    if (!this.storage) throw new ArtifactStorageUnavailableError();
    return this.storage;
  }

  private requireLearner(principal: HumanPrincipal | undefined): HumanPrincipal {
    if (!principal || !principal.roles.includes("LEARNER")) {
      throw new AuthorizationDeniedError("learner role required");
    }
    return principal;
  }
}
