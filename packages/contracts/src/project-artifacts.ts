import { z } from "zod";

export const projectArtifactUploadRequestSchema = z.object({
  contentType: z.string().trim().min(1).max(255),
  contentLength: z.number().int().min(1).max(10 * 1024 * 1024),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();

export const projectArtifactUploadResponseSchema = z.object({
  artifactId: z.string().uuid(),
  artifactRevisionId: z.string().uuid(),
  revisionNumber: z.number().int().positive(),
  uploadUrl: z.string().url(),
  method: z.literal("PUT"),
  requiredHeaders: z.record(z.string(), z.string()),
  expiresAt: z.string().datetime(),
}).strict();

export const projectArtifactSealResponseSchema = z.object({
  artifactRevisionId: z.string().uuid(),
  sealedAt: z.string().datetime(),
  status: z.literal("SEALED"),
}).strict();

export type ProjectArtifactUploadRequest = z.infer<typeof projectArtifactUploadRequestSchema>;
export type ProjectArtifactUploadResponse = z.infer<typeof projectArtifactUploadResponseSchema>;
export type ProjectArtifactSealResponse = z.infer<typeof projectArtifactSealResponseSchema>;
