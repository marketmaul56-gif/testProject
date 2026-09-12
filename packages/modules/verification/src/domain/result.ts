import type { VerificationLifecycleStatus } from "../../../../contracts/src/verification.ts";

export type VerificationStatus = VerificationLifecycleStatus;

export function isTerminalVerificationStatus(status: VerificationStatus): boolean {
  return status === "PASSED" || status === "FAILED" || status === "ERROR";
}

export function isAuthoritativePass(status: VerificationStatus): boolean {
  return status === "PASSED";
}

export function isLearnerFailure(status: VerificationStatus): boolean {
  return status === "FAILED";
}

export function isInfrastructureFailure(status: VerificationStatus): boolean {
  return status === "ERROR";
}
