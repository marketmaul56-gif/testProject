import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type {
  VerifierExecutionRequest,
  VerifierExecutionResult,
  VerifierExecutor,
} from "../../../packages/modules/verification/src/application/authority.ts";
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
      const finishReject = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
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
        clearTimeout(timer);
        resolve(Object.freeze({ exitCode: code ?? 1, stdout, stderr }));
      });
      const timer = setTimeout(() => finishReject(new Error("verifier wall-clock timeout exceeded")), options.timeoutMs);
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
    const bundle = await this.bundles.prepare(request, this.policy);
    try {
      const execution = await this.runner.run(
        "runsc",
        ["--rootless", "--network=none", "run", bundle.containerId],
        {
          cwd: bundle.bundlePath,
          timeoutMs: this.policy.wallClockMs,
          maxOutputBytes: this.policy.maxOutputBytes,
          // No application, database, object-storage, AI, or cloud credentials.
          env: Object.freeze({ PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" }),
        },
      );
      if (execution.exitCode !== 0) throw new Error("sandboxed verifier returned infrastructure error");
      const parsed = resultSchema.parse(JSON.parse(await readFile(bundle.resultPath, "utf8")));
      return Object.freeze({
        outcome: parsed.outcome,
        diagnostic: Object.freeze({
          classification: "VERIFICATION" as const,
          summaryCode: parsed.summaryCode,
          ...(parsed.passedChecks === undefined ? {} : { passedChecks: parsed.passedChecks }),
          ...(parsed.totalChecks === undefined ? {} : { totalChecks: parsed.totalChecks }),
        }),
      });
    } finally {
      // runsc state cleanup is delegated to the bundle factory/node runtime; the
      // ephemeral bundle itself is always destroyed after execution.
      await bundle.cleanup();
    }
  }
}
