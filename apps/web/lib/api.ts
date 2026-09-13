import { headers } from "next/headers";
import type { ZodType } from "zod";
import {
  guidanceResponseSchema,
  instructorCohortOverviewSchema,
  instructorCohortsSchema,
  instructorLearnerDetailSchema,
  learnerOverviewSchema,
  type GuidanceResponse,
  type InstructorCohortOverview,
  type InstructorCohorts,
  type InstructorLearnerDetail,
  type LearnerOverview,
} from "@skill-platform/contracts/experience";
import {
  projectArtifactSealResponseSchema,
  projectArtifactUploadResponseSchema,
  type ProjectArtifactSealResponse,
  type ProjectArtifactUploadResponse,
} from "@skill-platform/contracts/project-artifacts";
import {
  submissionQueuedResponseSchema,
  type SubmissionQueuedResponse,
} from "@skill-platform/contracts/submissions";

const API_BASE = process.env.INTERNAL_API_BASE_URL ?? "http://localhost:3001/api/v1";

export class ApiRequestError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`API request failed with status ${status}`);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

async function request<T>(tenantId: string, path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  const incoming = await headers();
  const cookie = incoming.get("cookie");
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "x-tenant-id": tenantId,
      ...(cookie ? { cookie } : {}),
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw new ApiRequestError(response.status);
  return schema.parse(await response.json());
}

export function getLearnerOverview(tenantId: string): Promise<LearnerOverview> {
  return request(tenantId, "/learner/overview", learnerOverviewSchema);
}

export function submitPractice(
  tenantId: string,
  practiceRevisionId: string,
  requestId: string,
  artifact: Readonly<Record<string, unknown>>,
): Promise<SubmissionQueuedResponse> {
  return request(tenantId, "/learner/submissions/practice", submissionQueuedResponseSchema, {
    method: "POST",
    body: JSON.stringify({ practiceRevisionId, requestId, artifact }),
  });
}

export function createProjectArtifactUpload(
  tenantId: string,
  projectDefinitionId: string,
  input: Readonly<{ contentType: string; contentLength: number; contentHash: string }>,
): Promise<ProjectArtifactUploadResponse> {
  return request(
    tenantId,
    `/learner/projects/${encodeURIComponent(projectDefinitionId)}/artifacts/upload-intent`,
    projectArtifactUploadResponseSchema,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function sealProjectArtifact(
  tenantId: string,
  artifactRevisionId: string,
): Promise<ProjectArtifactSealResponse> {
  return request(
    tenantId,
    `/learner/artifacts/${encodeURIComponent(artifactRevisionId)}/seal`,
    projectArtifactSealResponseSchema,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function submitProject(
  tenantId: string,
  artifactRevisionId: string,
  requestId: string,
): Promise<SubmissionQueuedResponse> {
  return request(tenantId, "/learner/submissions/project", submissionQueuedResponseSchema, {
    method: "POST",
    body: JSON.stringify({ artifactRevisionId, requestId }),
  });
}

export function getInstructorCohorts(tenantId: string): Promise<InstructorCohorts> {
  return request(tenantId, "/instructor/cohorts", instructorCohortsSchema);
}

export function getInstructorCohort(tenantId: string, cohortId: string): Promise<InstructorCohortOverview> {
  return request(tenantId, `/instructor/cohorts/${encodeURIComponent(cohortId)}`, instructorCohortOverviewSchema);
}

export function getInstructorLearner(tenantId: string, cohortId: string, learnerId: string): Promise<InstructorLearnerDetail> {
  return request(
    tenantId,
    `/instructor/cohorts/${encodeURIComponent(cohortId)}/learners/${encodeURIComponent(learnerId)}`,
    instructorLearnerDetailSchema,
  );
}

export function postGuidance(tenantId: string, cohortId: string, learnerId: string, message: string): Promise<GuidanceResponse> {
  return request(
    tenantId,
    `/instructor/cohorts/${encodeURIComponent(cohortId)}/learners/${encodeURIComponent(learnerId)}/guidance`,
    guidanceResponseSchema,
    { method: "POST", body: JSON.stringify({ message }) },
  );
}
