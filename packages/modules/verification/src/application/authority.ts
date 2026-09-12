import type { VerificationOutcome } from "../../../../contracts/src/verification.ts";

export type VerificationTarget = Readonly<
  | { kind: "PRACTICE"; submissionId: string }
  | { kind: "PROJECT"; submissionId: string }
>;

export type SafeVerifierDiagnostic = Readonly<{
  classification: "VERIFICATION" | "INFRASTRUCTURE";
  summaryCode: string;
  passedChecks?: number;
  totalChecks?: number;
}>;

export type VerifierExecutionRequest = Readonly<{
  tenantId: string;
  attemptId: string;
  target: VerificationTarget;
  artifactRef: string;
  hiddenTestBundleRef: string;
  verifierKey: string;
  verifierVersion: string;
}>;

export type VerifierExecutionResult = Readonly<{
  outcome: "PASSED" | "FAILED";
  diagnostic: SafeVerifierDiagnostic;
}>;

export interface VerifierExecutor {
  execute(request: VerifierExecutionRequest): Promise<VerifierExecutionResult>;
}

export type VerificationAttemptRequest = Readonly<{
  id: string;
  requestId: string;
  tenantId: string;
  target: VerificationTarget;
  verifierKey: string;
  verifierVersion: string;
  createdAt: Date;
}>;

export type AuthoritativeVerificationResult = Readonly<{
  id: string;
  attemptId: string;
  tenantId: string;
  learnerId: string;
  outcome: VerificationOutcome;
  diagnostic: SafeVerifierDiagnostic;
  completedAt: Date;
}>;

export interface VerificationAuthorityRepository {
  createOrGetAttempt(request: VerificationAttemptRequest): Promise<Readonly<{ id: string }>>;
  getResultForAttempt(attemptId: string): Promise<AuthoritativeVerificationResult | null>;
  claimRunning(attemptId: string, startedAt: Date): Promise<boolean>;
  finalize(input: Readonly<{
    attemptId: string;
    outcome: VerificationOutcome;
    diagnostic: SafeVerifierDiagnostic;
    completedAt: Date;
  }>): Promise<AuthoritativeVerificationResult>;
}

export class VerificationAttemptInProgressError extends Error {
  constructor() {
    super("verification attempt is already running");
    this.name = "VerificationAttemptInProgressError";
  }
}

export class VerificationDispatcherService {
  private readonly repository: VerificationAuthorityRepository;
  private readonly executor: VerifierExecutor;

  constructor(repository: VerificationAuthorityRepository, executor: VerifierExecutor) {
    this.repository = repository;
    this.executor = executor;
  }

  async verify(input: Readonly<VerificationAttemptRequest & {
    artifactRef: string;
    hiddenTestBundleRef: string;
  }>): Promise<AuthoritativeVerificationResult> {
    const attempt = await this.repository.createOrGetAttempt(input);
    const existing = await this.repository.getResultForAttempt(attempt.id);
    if (existing) return existing;

    const claimed = await this.repository.claimRunning(attempt.id, new Date());
    if (!claimed) {
      const racedResult = await this.repository.getResultForAttempt(attempt.id);
      if (racedResult) return racedResult;
      throw new VerificationAttemptInProgressError();
    }

    try {
      const result = await this.executor.execute({
        tenantId: input.tenantId,
        attemptId: attempt.id,
        target: input.target,
        artifactRef: input.artifactRef,
        hiddenTestBundleRef: input.hiddenTestBundleRef,
        verifierKey: input.verifierKey,
        verifierVersion: input.verifierVersion,
      });
      return this.repository.finalize({
        attemptId: attempt.id,
        outcome: result.outcome,
        diagnostic: result.diagnostic,
        completedAt: new Date(),
      });
    } catch {
      // Runtime, queue, sandbox, timeout, or host failures are infrastructure
      // ERROR. They are never learner FAILED.
      return this.repository.finalize({
        attemptId: attempt.id,
        outcome: "ERROR",
        diagnostic: {
          classification: "INFRASTRUCTURE",
          summaryCode: "VERIFIER_UNAVAILABLE",
        },
        completedAt: new Date(),
      });
    }
  }
}
