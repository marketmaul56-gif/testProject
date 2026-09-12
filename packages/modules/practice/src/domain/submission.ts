export function nextAttemptNumber(existingAttemptNumbers: readonly number[]): number {
  if (existingAttemptNumbers.some((value) => !Number.isInteger(value) || value < 1)) {
    throw new Error("attempt numbers must be positive integers");
  }
  return existingAttemptNumbers.length === 0 ? 1 : Math.max(...existingAttemptNumbers) + 1;
}

export function submissionIdempotencyKey(tenantId: string, learnerId: string, practiceRevisionId: string, requestId: string): string {
  if (![tenantId, learnerId, practiceRevisionId, requestId].every(Boolean)) {
    throw new Error("submission idempotency key inputs are required");
  }
  return [tenantId, learnerId, practiceRevisionId, requestId].join(":");
}
