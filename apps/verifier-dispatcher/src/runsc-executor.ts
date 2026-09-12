import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type {
  VerifierExecutionRequest,
  VerifierExecutionResult,
  VerifierExecutor,
} from "../../../packages/modules/verification/src/application/authority.ts";
import { verifierDuration, withSpan } from "../../../packages/platform/observability/src/telemetry.ts";
import type { VerifierSandboxPolicy } from "./sandbox-policy.ts";

const resultSchema = z.object({
  outcome: z.enum(["PASSED", "FAILED"]),
  summaryCode: z.string().trim().min(1).max(100),
  passedChecks: z.number().int().min(0).optional(),
  totalChecks: z.number().int().min(0).optional(),
}).strict();

export type PreparedVerifierBundle = Readonly<{
  bundlePath: string;
  containerId: string;
  resultPath: string;
  cleanup(): Promise<void>;
}>;

export interface VerifierBundleFactory {
  prepare(request: VerifierExecutionRequest, policy: VerifierSandboxPolicy): Promise<PreparedVerifierBundle>;
}

export type ProcessExecutionResult = Readonly<{ exitCode: number; stdout: string; stderr: string }>;

export interface IsolatedProcessRunner {
  run(command: string, args: readonly string[], options: Readonly<{
    cwd: string;
    timeoutMs: number;
    maxOutputBytes: number;
    env: Readonly<Record<string, string>>;
  }>): Promise<ProcessExecutionResult>;
}

export class NodeProcessRunner implements IsolatedProcessRunner {
  async run(command: string, args: readonly string[], options: Readonly<{
    cwd: string;
    timeoutMs: number;
    maxOutputBytes: number;
    env: Readonly<Record<string, string>>;
  }>): Promise<ProcessExecutionResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        env: { ...options.env },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let bytes = 0;
      let settled = false;
      let timer: NodeJS.Timeout | null = null;
      const finishReject = (error: Error) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        child.kill("SIGKILL");
        reject(error);
      };
      const append = (chunk: Buffer, channel: "stdout" | "stderr") => {
        bytes += chunk.byteLength;
        if (bytes > options.maxOutputBytes) {
          finishReject(new Error("verifier output limit exceeded"));
          return;
        }
        if (channel === "stdout") stdout += chunk.toString("utf8");
        else stderr += chunk.toString("utf8");
      };
      child.stdout?.on("data", (chunk: Buffer) => append(chunk, "stdout"));
      child.stderr?.on("data", (chunk: Buffer) => append(chunk, "stderr"));
      child.once("error", (error) => finishReject(error));
      child.once("close", (code) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(Object.freeze({ exitCode: code ?? 1, stdout, stderr }));
      });
      timer = setTimeout(() => finishReject(new Error("verifier wall-clock timeout exceeded")), options.timeoutMs);
      timer.unref();
    });
  }
}

export class RunscVerifierExecutor implements VerifierExecutor {
  private readonly policy: VerifierSandboxPolicy;
  private readonly bundles: VerifierBundleFactory;
  private readonly runner: IsolatedProcessRunner;

  constructor(policy: VerifierSandboxPolicy, bundles: VerifierBundleFactory, runner: IsolatedProcessRunner = new NodeProcessRunner()) {
    this.policy = policy;
    this.bundles = bundles;
    this.runner = runner;
  }

  async execute(request: VerifierExecutionRequest): Promise<VerifierExecutionResult> {
    return withSpan("verifier.execute", {
      "verifier.key": request.verifierKey,
      "verifier.version": request.verifierVersion,
    }, async () => {
      const started = performance.now();
      const bundle = await this.bundles.prepare(request, this.policy);
      const isolatedEnv = Object.freeze({ PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" });
      try {
        const execution = await this.runner.run(
          "runsc",
          ["--rootless", "--network=none", "run", bundle.containerId],
          {
            cwd: bundle.bundlePath,
            timeoutMs: this.policy.wallClockMs,
            maxOutputBytes: this.policy.maxOutputBytes,
            env: isolatedEnv,
          },
        );
        if (execution.exitCode !== 0) throw new Error("sandboxed verifier returned infrastructure error");
        const parsed = resultSchema.parse(JSON.parse(await readFile(bundle.resultPath, "utf8")));
        verifierDuration.record(performance.now() - started, { "verifier.outcome": parsed.outcome });
        return Object.freeze({
          outcome: parsed.outcome,
          diagnostic: Object.freeze({
            classification: "VERIFICATION" as const,
            summaryCode: parsed.summaryCode,
            ...(parsed.passedChecks === undefined ? {} : { passedChecks: parsed.passedChecks }),
            ...(parsed.totalChecks === undefined ? {} : { totalChecks: parsed.totalChecks }),
          }),
        });
      } catch (error) {
        verifierDuration.record(performance.now() - started, { "verifier.outcome": "ERROR" });
        throw error;
      } finally {
        try {
          await this.runner.run("runsc", ["--rootless", "delete", "--force", bundle.containerId], {
            cwd: bundle.bundlePath,
            timeoutMs: 5_000,
            maxOutputBytes: 8_192,
            env: isolatedEnv,
          });
        } catch {
          // Dedicated-node runtime reconciliation is handled by operational cleanup.
        }
        await bundle.cleanup();
      }
    });
  }
}
