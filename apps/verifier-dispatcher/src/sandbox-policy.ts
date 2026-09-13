export type VerifierSandboxPolicy = Readonly<{
  runtimeImageDigest: string;
  wallClockMs: number;
  memoryBytes: number;
  pidsLimit: number;
  cpuPeriodMicros: number;
  cpuQuotaMicros: number;
  maxOutputBytes: number;
  maxWorkspaceBytes: number;
  uid: number;
  gid: number;
}>;

export type VerifierSandboxMountSources = Readonly<{
  workspacePath: string;
  verificationInputPath: string;
}>;

export function createVerifierSandboxPolicy(runtimeImageDigest: string): VerifierSandboxPolicy {
  if (!/^sha256:[a-f0-9]{64}$/.test(runtimeImageDigest)) {
    throw new Error("verifier runtime image must be pinned by sha256 digest");
  }
  return Object.freeze({
    runtimeImageDigest,
    wallClockMs: 15_000,
    memoryBytes: 512 * 1024 * 1024,
    pidsLimit: 64,
    cpuPeriodMicros: 100_000,
    cpuQuotaMicros: 100_000,
    maxOutputBytes: 64 * 1024,
    maxWorkspaceBytes: 64 * 1024 * 1024,
    uid: 65532,
    gid: 65532,
  });
}

export function buildOciConfig(policy: VerifierSandboxPolicy, sources?: VerifierSandboxMountSources): Record<string, unknown> {
  const mounts: Record<string, unknown>[] = [
    { destination: "/proc", type: "proc", source: "proc" },
    { destination: "/dev", type: "tmpfs", source: "tmpfs", options: ["nosuid", "strictatime", "mode=755", "size=65536k"] },
    { destination: "/tmp", type: "tmpfs", source: "tmpfs", options: ["nosuid", "nodev", "mode=1777", "size=65536k"] },
  ];
  if (sources) {
    mounts.push(
      { destination: "/workspace", type: "bind", source: sources.workspacePath, options: ["rbind", "rw", "nosuid", "nodev"] },
      { destination: "/opt/verification-input", type: "bind", source: sources.verificationInputPath, options: ["rbind", "ro", "nosuid", "nodev", "noexec"] },
    );
  }
  return {
    ociVersion: "1.2.0",
    process: {
      terminal: false,
      user: { uid: policy.uid, gid: policy.gid },
      args: ["/usr/local/bin/verify", "/workspace/submission", "/opt/verification-input", "/workspace/result.json"],
      env: ["LANG=C.UTF-8", "HOME=/tmp"],
      cwd: "/workspace",
      noNewPrivileges: true,
      rlimits: [
        { type: "RLIMIT_NOFILE", hard: 128, soft: 128 },
        { type: "RLIMIT_NPROC", hard: policy.pidsLimit, soft: policy.pidsLimit },
        { type: "RLIMIT_FSIZE", hard: policy.maxWorkspaceBytes, soft: policy.maxWorkspaceBytes },
      ],
    },
    root: { path: "rootfs", readonly: true },
    hostname: "verifier",
    mounts,
    linux: {
      namespaces: [
        { type: "pid" },
        { type: "ipc" },
        { type: "uts" },
        { type: "mount" },
        { type: "user" },
      ],
      resources: {
        memory: { limit: policy.memoryBytes, swap: 0 },
        pids: { limit: policy.pidsLimit },
        cpu: { period: policy.cpuPeriodMicros, quota: policy.cpuQuotaMicros },
      },
    },
    annotations: {
      "ai.skill-platform.runtime-image-digest": policy.runtimeImageDigest,
      "ai.skill-platform.network": "disabled",
    },
  };
}
