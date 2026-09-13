"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  createProjectArtifactUpload,
  sealProjectArtifact,
  submitPractice,
  submitProject,
} from "@/lib/api";

const allowedProjectContentTypes = new Set([
  "application/json",
  "text/plain",
  "application/zip",
  "application/octet-stream",
]);

function learningPath(tenantId: string): string {
  return `/t/${encodeURIComponent(tenantId)}/learn`;
}

export async function submitPracticeAction(
  tenantId: string,
  practiceRevisionId: string,
  formData: FormData,
): Promise<void> {
  const solution = String(formData.get("solution") ?? "").trim();
  if (!solution) throw new Error("Practice solution is required.");
  if (solution.length > 100_000) throw new Error("Practice solution is too large.");

  await submitPractice(tenantId, practiceRevisionId, randomUUID(), { solution });
  revalidatePath(learningPath(tenantId));
}

export async function submitProjectArtifactAction(
  tenantId: string,
  projectDefinitionId: string,
  formData: FormData,
): Promise<void> {
  const entry = formData.get("artifact");
  if (!(entry instanceof File) || entry.size === 0) throw new Error("Project artifact file is required.");
  if (entry.size > 10 * 1024 * 1024) throw new Error("Project artifact exceeds the 10 MB MVP limit.");

  const contentType = allowedProjectContentTypes.has(entry.type)
    ? entry.type
    : "application/octet-stream";
  const bytes = Buffer.from(await entry.arrayBuffer());
  const contentHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

  const intent = await createProjectArtifactUpload(tenantId, projectDefinitionId, {
    contentType,
    contentLength: bytes.byteLength,
    contentHash,
  });

  const upload = await fetch(intent.uploadUrl, {
    method: "PUT",
    body: bytes,
    headers: intent.requiredHeaders,
    cache: "no-store",
  });
  if (!upload.ok) throw new Error("Project artifact upload failed before sealing.");

  await sealProjectArtifact(tenantId, intent.artifactRevisionId);
  await submitProject(tenantId, intent.artifactRevisionId, randomUUID());
  revalidatePath(learningPath(tenantId));
}
