import type { VerificationOutcome } from "../../../../contracts/src/verification.ts";

export type VerificationForEvidence = Readonly<{
  id: string;
  tenantId: string;
  learnerId: string;
  status: VerificationOutcome;
  verifierKey: string;
  verifierVersion: string;
  completedAt: string;
}>;

export type SkillEvidence = Readonly<{
  id: string;
  tenantId: string;
  learnerId: string;
  skillId: string;
  verificationResultId: string;
  verifierKey: string;
  verifierVersion: string;
  issuedAt: string;
}>;

export function evidenceUniquenessKey(tenantId: string, verificationResultId: string, skillId: string): string {
  return `${tenantId}:${verificationResultId}:${skillId}`;
}

export function issueEvidenceFromVerification(
  verification: VerificationForEvidence,
  input: Readonly<{ evidenceId: string; skillId: string; issuedAt: string }>,
): SkillEvidence {
  if (verification.status !== "PASSED") {
    throw new Error("only PASSED authoritative verification may issue evidence");
  }
  return Object.freeze({
    id: input.evidenceId,
    tenantId: verification.tenantId,
    learnerId: verification.learnerId,
    skillId: input.skillId,
    verificationResultId: verification.id,
    verifierKey: verification.verifierKey,
    verifierVersion: verification.verifierVersion,
    issuedAt: input.issuedAt,
  });
}
