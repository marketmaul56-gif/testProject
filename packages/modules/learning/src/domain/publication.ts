export type LearningVersionStatus = "DRAFT" | "PUBLISHED";

export type LearningVersion = Readonly<{
  id: string;
  tenantId: string;
  version: number;
  status: LearningVersionStatus;
  publishedAt: string | null;
}>;

export function publishLearningVersion(version: LearningVersion, now: string): LearningVersion {
  if (version.status !== "DRAFT" || version.publishedAt !== null) {
    throw new Error("only a draft learning version may be published");
  }
  return Object.freeze({ ...version, status: "PUBLISHED" as const, publishedAt: now });
}

export function assertLearningVersionMutable(version: LearningVersion): void {
  if (version.status === "PUBLISHED" || version.publishedAt !== null) {
    throw new Error("published learning versions are immutable");
  }
}
