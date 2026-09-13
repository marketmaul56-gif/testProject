import type { RuntimeConfig } from "../../config/src/config.ts";
import { createBetterAuth } from "./better-auth.ts";

const authDatabaseUrl = process.env.AUTH_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/skill_platform?options=-c%20search_path%3Dauth";

const schemaConfig: RuntimeConfig = Object.freeze({
  environment: "test",
  port: 3001,
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/skill_platform",
  authDatabaseUrl,
  betterAuthUrl: "http://localhost:3001",
  betterAuthSecret: "schema-generation-only-secret-32-characters-minimum",
  trustedOrigins: Object.freeze(["http://localhost:3000"]),
  ai: Object.freeze({ enabled: false, apiKey: null, model: null, timeoutMs: 8_000 }),
  storage: null,
});

export const { auth } = createBetterAuth(schemaConfig);
