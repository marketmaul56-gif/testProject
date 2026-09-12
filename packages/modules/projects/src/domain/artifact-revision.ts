export type ArtifactRevision = Readonly<{
  id: string;
  artifactId: string;
  revisionNumber: number;
  sealedAt: string | null;
}>;

export function sealArtifactRevision(revision: ArtifactRevision, now: string): ArtifactRevision {
  if (revision.sealedAt !== null) throw new Error("artifact revision is already immutable");
  return Object.freeze({ ...revision, sealedAt: now });
}

export function assertArtifactRevisionMutable(revision: ArtifactRevision): void {
  if (revision.sealedAt !== null) throw new Error("submitted artifact revisions are immutable");
}
