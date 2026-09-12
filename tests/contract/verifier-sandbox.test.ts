import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RunscVerifierExecutor, type IsolatedProcessRunner, type ProcessExecutionResult, type VerifierBundleFactory } from "../../apps/verifier-dispatcher/src/runsc-executor.ts";
import { buildOciConfig, createVerifierSandboxPolicy } from "../../apps/verifier-dispatcher/src/sandbox-policy.ts";
import { VerificationDispatcherService, type VerificationAuthorityRepository, type VerifierExecutor } from "../../packages/modules/verification/src/application/authority.ts";

const digest = `sha256:${"a".repeat(64)}`;

test("verifier sandbox requires pinned image digest and restrictive OCI policy", () => {
  assert.throws(() => createVerifierSandboxPolicy("latest"));
  const policy = createVerifierSandboxPolicy(digest);
  const config = buildOciConfig(policy) as any;
  assert.equal(config.root.readonly, true);
  assert.notEqual(config.process.user.uid, 0);
  assert.equal(config.process.noNewPrivileges, true);
  assert.equal(config.linux.resources.memory.limit, 512 * 1024 * 1024);
  assert.equal(config.linux.resources.pids.limit, 64);
  assert.equal(config.annotations["ai.skill-platform.network"], "disabled");
  assert.equal(JSON.stringify(config).includes("hidden-test"), false);
  assert.equal(JSON.stringify(config).includes("OPENAI_API_KEY"), false);
  assert.equal(JSON.stringify(config).includes("DATABASE_URL"), false);
});

test("runsc invocation is rootless, networkless, secret-free and always cleaned up", async () => {
  const root = await mkdtemp(join(tmpdir(), "verifier-contract-"));
  const resultPath = join(root, "result.json");
  await writeFile(resultPath, JSON.stringify({ outcome: "PASSED", summaryCode: "OK", passedChecks: 3, totalChecks: 3 }));
  let bundleCleaned = false;
  const factory: VerifierBundleFactory = {
    async prepare() {
      return {
        bundlePath: root,
        containerId: "verify-test",
        resultPath,
        async cleanup() { bundleCleaned = true; await rm(root, { recursive: true, force: true }); },
      };
    },
  };
  const calls: Array<{ command: string; args: readonly string[]; env: Readonly<Record<string, string>> }> = [];
  const runner: IsolatedProcessRunner = {
    async run(command, args, options): Promise<ProcessExecutionResult> {
      calls.push({ command, args, env: options.env });
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  };
  const executor = new RunscVerifierExecutor(createVerifierSandboxPolicy(digest), factory, runner);
  const secretRef = "s3://private-hidden-tests/super-secret-key";
  const result = await executor.execute({
    tenantId: "00000000-0000-7000-8000-000000000001",
    attemptId: "00000000-0000-7000-8000-000000000002",
    target: { kind: "PRACTICE", submissionId: "00000000-0000-7000-8000-000000000003" },
    artifactRef: "artifact://submission",
    hiddenTestBundleRef: secretRef,
    verifierKey: "typescript",
    verifierVersion: "1",
  });
  assert.equal(result.outcome, "PASSED");
  assert.deepEqual(calls[0]?.args, ["--rootless", "--network=none", "run", "verify-test"]);
  assert.deepEqual(calls[1]?.args, ["--rootless", "delete", "--force", "verify-test"]);
  const executionSurface = JSON.stringify(calls);
  assert.equal(executionSurface.includes(secretRef), false);
  assert.equal(executionSurface.includes("DATABASE_URL"), false);
  assert.equal(executionSurface.includes("OPENAI_API_KEY"), false);
  assert.equal(bundleCleaned, true);
});

test("verifier infrastructure exception becomes ERROR, never learner FAILED", async () => {
  let finalizedOutcome = "";
  const repository: VerificationAuthorityRepository = {
    async createOrGetAttempt() { return { id: "attempt-1" }; },
    async getResultForAttempt() { return null; },
    async claimRunning() { return true; },
    async finalize(input) {
      finalizedOutcome = input.outcome;
      return {
        id: "result-1",
        attemptId: input.attemptId,
        tenantId: "tenant-1",
        learnerId: "learner-1",
        outcome: input.outcome,
        diagnostic: input.diagnostic,
        completedAt: input.completedAt,
      };
    },
  };
  const executor: VerifierExecutor = { async execute() { throw new Error("sandbox unavailable"); } };
  const dispatcher = new VerificationDispatcherService(repository, executor);
  const result = await dispatcher.verify({
    id: "attempt-1",
    requestId: "request-1",
    tenantId: "tenant-1",
    target: { kind: "PRACTICE", submissionId: "submission-1" },
    verifierKey: "typescript",
    verifierVersion: "1",
    createdAt: new Date(),
    artifactRef: "artifact://submission",
    hiddenTestBundleRef: "private://bundle",
  });
  assert.equal(result.outcome, "ERROR");
  assert.equal(finalizedOutcome, "ERROR");
  assert.equal(result.diagnostic.classification, "INFRASTRUCTURE");
});
