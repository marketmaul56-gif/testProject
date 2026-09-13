#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const manifestPath = process.argv[2] ?? "release/release-manifest.json";
const verifyImages = process.env.VERIFY_IMAGES !== "false";
const manifest = JSON.parse(readFileSync(join(root, manifestPath), "utf8"));

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return sha256Buffer(readFileSync(join(root, path)));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verifyDescriptor(descriptor, label) {
  assert(descriptor && typeof descriptor.path === "string", `${label}: missing path`);
  const absolute = join(root, descriptor.path);
  assert(existsSync(absolute), `${label}: file missing: ${descriptor.path}`);
  assert(sha256File(descriptor.path) === descriptor.sha256, `${label}: SHA-256 mismatch: ${descriptor.path}`);
  assert(statSync(absolute).size === descriptor.bytes, `${label}: size mismatch: ${descriptor.path}`);
}

assert(manifest.schemaVersion === 1, "unsupported manifest schema version");
assert(/^[0-9a-f]{40}$/.test(manifest.source?.commit ?? ""), "manifest source commit is invalid");
assert(/^sha256:[0-9a-f]{64}$/.test(manifest.releaseFingerprint ?? ""), "manifest release fingerprint is invalid");
assert(Array.isArray(manifest.images) && manifest.images.length === 4, "release must contain exactly four service images");

for (const image of manifest.images) {
  assert(/^sha256:[0-9a-f]{64}$/.test(image.imageId ?? ""), `invalid image ID: ${image.component}`);
  assert(sha256File(image.dockerfile) === image.dockerfileSha256, `Dockerfile hash mismatch: ${image.component}`);
  if (verifyImages) {
    const current = execFileSync("docker", ["image", "inspect", "--format={{.Id}}", image.tag], { encoding: "utf8" }).trim();
    assert(current === image.imageId, `local image identity mismatch: ${image.component}`);
  }
}

assert(Array.isArray(manifest.database?.migrations) && manifest.database.migrations.length > 0, "migration list is empty");
for (const migration of manifest.database.migrations) verifyDescriptor(migration, "migration");
const migrationSet = manifest.database.migrations.map((entry) => `${entry.path}\0${entry.sha256}\n`).join("");
assert(sha256Buffer(migrationSet) === manifest.database.migrationSetSha256, "migration set hash mismatch");
assert(manifest.database.migrationCount === manifest.database.migrations.length, "migration count mismatch");
verifyDescriptor(manifest.database.prismaSchema, "Prisma schema");
verifyDescriptor(manifest.inputs.pnpmLock, "pnpm lockfile");
verifyDescriptor(manifest.inputs.runtimeContract, "runtime contract");
verifyDescriptor(manifest.bundles.images, "image bundle");
verifyDescriptor(manifest.bundles.migrations, "migration bundle");

for (const [key, value] of Object.entries(manifest.execution ?? {})) {
  if (key === "reason") continue;
  assert(value === "DEFERRED", `live execution field must remain DEFERRED: ${key}`);
}

const { generatedAt: _generatedAt, releaseFingerprint: _fingerprint, ...core } = manifest;
const expectedFingerprint = `sha256:${sha256Buffer(JSON.stringify(core))}`;
assert(expectedFingerprint === manifest.releaseFingerprint, "release fingerprint mismatch");

console.log(JSON.stringify({ verified: true, manifest: manifestPath, releaseFingerprint: manifest.releaseFingerprint, verifyImages }));
