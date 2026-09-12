import assert from "node:assert/strict";
import test from "node:test";
import { loadRuntimeConfig } from "../../packages/platform/config/src/config.ts";

const base = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/skill_platform",
  AUTH_DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/skill_platform",
  BETTER_AUTH_URL: "http://localhost:3001",
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-thirty-two-characters",
  TRUSTED_ORIGINS: "http://localhost:3000,http://localhost:3001",
} as const;

const productionStorage = {
  OBJECT_STORAGE_ENDPOINT: "https://objects.example.com",
  OBJECT_STORAGE_REGION: "test-1",
  OBJECT_STORAGE_BUCKET: "skill-platform-artifacts",
  OBJECT_STORAGE_FORCE_PATH_STYLE: "false",
} as const;

test("runtime config accepts unrelated host environment variables", () => {
  const config = loadRuntimeConfig({ ...base, PATH: "/usr/bin", CI: "true", GITHUB_ACTIONS: "true" });
  assert.equal(config.environment, "test");
  assert.deepEqual(config.trustedOrigins, ["http://localhost:3000", "http://localhost:3001"]);
  assert.equal(config.storage, null);
});

test("runtime config rejects missing application-owned required values", () => {
  const { DATABASE_URL: _databaseUrl, ...missingDatabase } = base;
  assert.throws(() => loadRuntimeConfig(missingDatabase), /DATABASE_URL/);
});

test("runtime config rejects trusted origins containing a path", () => {
  assert.throws(
    () => loadRuntimeConfig({ ...base, TRUSTED_ORIGINS: "https://example.com/path" }),
    /must not include a path/,
  );
});

test("production fails fast without object storage", () => {
  assert.throws(
    () => loadRuntimeConfig({
      ...base,
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "production-auth-secret-0123456789abcdef",
      BETTER_AUTH_URL: "https://api.example.com",
      TRUSTED_ORIGINS: "https://app.example.com",
    }),
    /production requires S3-compatible object storage/,
  );
});

test("runtime config rejects development authentication secret in production", () => {
  assert.throws(
    () => loadRuntimeConfig({
      ...base,
      ...productionStorage,
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "local-only-development-secret-1234567890",
      BETTER_AUTH_URL: "https://api.example.com",
      TRUSTED_ORIGINS: "https://app.example.com",
    }),
    /production cannot use a development authentication secret/,
  );
});

test("runtime config returns validated S3-compatible storage contract", () => {
  const config = loadRuntimeConfig({
    ...base,
    ...productionStorage,
    NODE_ENV: "production",
    BETTER_AUTH_SECRET: "production-auth-secret-0123456789abcdef",
    BETTER_AUTH_URL: "https://api.example.com",
    TRUSTED_ORIGINS: "https://app.example.com",
  });
  assert.deepEqual(config.storage, {
    endpoint: "https://objects.example.com",
    region: "test-1",
    bucket: "skill-platform-artifacts",
    forcePathStyle: false,
    accessKeyId: null,
    secretAccessKey: null,
  });
});
