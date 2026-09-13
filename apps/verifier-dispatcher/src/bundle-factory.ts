import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { VerifierExecutionRequest } from "../../../packages/modules/verification/src/application/authority.ts";
import { buildOciConfig, type VerifierSandboxPolicy } from "./sandbox-policy.ts";
import type { PreparedVerifierBundle, VerifierBundleFactory } from "./runsc-executor.ts";

export type TrustedArtifactResolver = Readonly<{
  materialize(objectKey: string, target: string, maxBytes: number): Promise<void>;
}>;

async function assertWithin(root: string, candidate: string): Promise<string> {
  const [rootPath, candidatePath] = await Promise.all([realpath(root), realpath(candidate)]);
  if (candidatePath !== rootPath && !candidatePath.startsWith(`${rootPath}${sep}`)) {
    throw new Error("reference escapes configured verifier root");
  }
  return candidatePath;
}

function parseObjectReference(reference: string): Readonly<{ objectKey: string; expectedHash: string | null }> | null {
  const match = /^object:\/\/([^?]+)(?:\?sha256=([^&]+))?$/.exec(reference);
  if (!match) return null;
  const objectKey = decodeURIComponent(match[1]!);
  const expectedHash = match[2] ? decodeURIComponent(match[2]) : null;
  if (!objectKey || objectKey.startsWith("/") || objectKey.includes("..")) throw new Error("invalid trusted artifact object key");
  if (expectedHash && !/^sha256:[a-f0-9]{64}$/.test(expectedHash)) throw new Error("invalid trusted artifact hash");
  return Object.freeze({ objectKey, expectedHash });
}

export class LocalVerifierBundleFactory implements VerifierBundleFactory {
  private readonly rootfsDir: string;
  private readonly hiddenBundlesRoot: string;
  private readonly artifactStagingRoot: string | null;
  private readonly artifactResolver: TrustedArtifactResolver | null;

  constructor(
    rootfsDir: string,
    hiddenBundlesRoot: string,
    artifactStagingRoot: string | null = null,
    artifactResolver: TrustedArtifactResolver | null = null,
  ) {
    this.rootfsDir = resolve(rootfsDir);
    this.hiddenBundlesRoot = resolve(hiddenBundlesRoot);
    this.artifactStagingRoot = artifactStagingRoot ? resolve(artifactStagingRoot) : null;
    this.artifactResolver = artifactResolver;
  }

  async prepare(request: VerifierExecutionRequest, policy: VerifierSandboxPolicy): Promise<PreparedVerifierBundle> {
    const digestMarker = (await readFile(join(this.rootfsDir, ".runtime-image-digest"), "utf8")).trim();
    if (digestMarker !== policy.runtimeImageDigest) throw new Error("verifier rootfs does not match pinned runtime digest");

    const bundlePath = await mkdtemp(join(tmpdir(), "skill-verifier-"));
    const workspacePath = join(bundlePath, "workspace");
    const verificationInputPath = join(bundlePath, "verification-input");
    const rootfsPath = join(bundlePath, "rootfs");
    await mkdir(workspacePath, { recursive: true });
    await cp(this.rootfsDir, rootfsPath, { recursive: true, force: false });
    await this.materializeArtifact(request.artifactRef, join(workspacePath, "submission"), policy.maxWorkspaceBytes);
    await this.materializeHiddenBundle(request.hiddenTestBundleRef, verificationInputPath);
    await writeFile(
      join(bundlePath, "config.json"),
      JSON.stringify(buildOciConfig(policy, { workspacePath, verificationInputPath })),
      { mode: 0o600 },
    );
    const containerId = `verify-${request.attemptId.replaceAll("-", "")}`;
    return Object.freeze({
      bundlePath,
      containerId,
      resultPath: join(workspacePath, "result.json"),
      async cleanup() { await rm(bundlePath, { recursive: true, force: true }); },
    });
  }

  private async materializeArtifact(reference: string, target: string, maxBytes: number): Promise<void> {
    const data = /^data:(application\/json|text\/plain);base64,(.+)$/.exec(reference);
    if (data) {
      const decoded = Buffer.from(data[2] ?? "", "base64");
      if (decoded.byteLength > maxBytes) throw new Error("artifact exceeds workspace limit");
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, decoded, { mode: 0o600 });
      return;
    }
    if (reference.startsWith("file://") && this.artifactStagingRoot) {
      const source = await assertWithin(this.artifactStagingRoot, fileURLToPath(reference));
      const sourceStat = await stat(source);
      if (!sourceStat.isFile() || sourceStat.size > maxBytes) throw new Error("invalid staged artifact");
      await cp(source, target, { force: false });
      return;
    }
    const objectReference = parseObjectReference(reference);
    if (objectReference && this.artifactResolver) {
      await this.artifactResolver.materialize(objectReference.objectKey, target, maxBytes);
      if (objectReference.expectedHash) {
        const bytes = await readFile(target);
        const actual = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
        if (actual !== objectReference.expectedHash) {
          await rm(target, { force: true });
          throw new Error("trusted object storage artifact hash does not match sealed revision");
        }
      }
      return;
    }
    throw new Error("artifact reference requires a configured trusted resolver");
  }

  private async materializeHiddenBundle(reference: string, target: string): Promise<void> {
    if (!reference.startsWith("file://")) throw new Error("hidden test bundle must be a verifier-host file reference");
    const source = await assertWithin(this.hiddenBundlesRoot, fileURLToPath(reference));
    const sourceStat = await stat(source);
    if (sourceStat.isDirectory()) await cp(source, target, { recursive: true, force: false });
    else {
      await mkdir(target, { recursive: true });
      await cp(source, join(target, "bundle"), { force: false });
    }
  }
}
