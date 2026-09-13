#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const root = process.cwd();
const output = process.argv[2] ?? "release/release-manifest.json";
const releaseSha = process.env.RELEASE_SHA ?? process.env.GITHUB_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const repository = process.env.GITHUB_REPOSITORY ?? "marketmaul56-gif/testProject";

if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
  throw new Error(`RELEASE_SHA must be a full lowercase git SHA: ${releaseSha}`);
}

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return sha256Buffer(readFileSync(join(root, path)));
}

function fileDescriptor(path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) throw new Error(`release input missing: ${path}`);
  return { path, sha256: sha256File(path), bytes: statSync(absolute).size };
}

function imageId(tag) {
  const value = execFileSync("docker", ["image", "inspect", "--format={{.Id}}", tag], { encoding: "utf8" }).trim();
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) throw new Error(`invalid Docker image ID for ${tag}: ${value}`);
  return value;
}

const imageDefinitions = [
  ["api", "skill-platform-api", "infrastructure/deployment/Dockerfile.api"],
  ["web", "skill-platform-web", "infrastructure/deployment/Dockerfile.web"],
  ["worker", "skill-platform-worker", "infrastructure/deployment/Dockerfile.worker"],
  ["verifier-dispatcher", "skill-platform-verifier-dispatcher", "infrastructure/deployment/Dockerfile.verifier-dispatcher"],
];

const images = imageDefinitions.map(([component, repositoryName, dockerfile]) => {
  const tag = `${repositoryName}:${releaseSha}`;
  return {
    component,
    tag,
    imageId: imageId(tag),
    dockerfile,
    dockerfileSha256: sha256File(dockerfile),
  };
});

const migrationsRoot = join(root, "prisma/migrations");
const migrationFiles = readdirSync(migrationsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `prisma/migrations/${entry.name}/migration.sql`)
  .filter((path) => existsSync(join(root, path)))
  .sort()
  .map((path) => ({ path, sha256: sha256File(path), bytes: statSync(join(root, path)).size }));

if (migrationFiles.length === 0) throw new Error("no version-controlled migrations found");

const migrationSetSha256 = sha256Buffer(migrationFiles.map((entry) => `${entry.path}\0${entry.sha256}\n`).join(""));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const bundlePaths = ["release/images.tar.gz", "release/migrations.tar.gz"];
const bundles = Object.fromEntries(bundlePaths.map((path) => [path.includes("images") ? "images" : "migrations", fileDescriptor(path)]));
const runtimeContract = fileDescriptor("infrastructure/deployment/production-runtime-contract.json");

const core = {
  schemaVersion: 1,
  source: { repository, commit: releaseSha },
  toolchain: {
    node: process.version,
    packageManager: packageJson.packageManager,
  },
  images,
  database: {
    migrationCount: migrationFiles.length,
    migrationSetSha256,
    migrations: migrationFiles,
    prismaSchema: fileDescriptor("prisma/schema.prisma"),
  },
  inputs: {
    pnpmLock: fileDescriptor("pnpm-lock.yaml"),
    runtimeContract,
  },
  bundles,
  execution: {
    registryPromotion: "DEFERRED",
    productionMigrationApply: "DEFERRED",
    liveTenantAdminBootstrap: "DEFERRED",
    liveBackupCheckpoint: "DEFERRED",
    reason: "Project-owner decision: continue release preparation without a live AWS environment.",
  },
};

const releaseFingerprint = `sha256:${sha256Buffer(JSON.stringify(core))}`;
const manifest = { ...core, generatedAt: new Date().toISOString(), releaseFingerprint };
mkdirSync(dirname(join(root, output)), { recursive: true });
writeFileSync(join(root, output), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output: relative(root, join(root, output)), releaseFingerprint, images: images.length, migrations: migrationFiles.length }));
