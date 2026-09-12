import { z } from "zod";

const postgresUrl = z.string().url().refine((value) => value.startsWith("postgresql://") || value.startsWith("postgres://"), {
  message: "must be a PostgreSQL URL",
});

const environmentSchema = z.object({
  NODE_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: postgresUrl,
  AUTH_DATABASE_URL: postgresUrl,
  BETTER_AUTH_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  TRUSTED_ORIGINS: z.string().min(1),
}).strict();

export type RuntimeConfig = Readonly<{
  environment: "local" | "test" | "staging" | "production";
  port: number;
  databaseUrl: string;
  authDatabaseUrl: string;
  betterAuthUrl: string;
  betterAuthSecret: string;
  trustedOrigins: readonly string[];
}>;

export function loadRuntimeConfig(input: Record<string, string | undefined>): RuntimeConfig {
  const parsed = environmentSchema.parse(input);
  const trustedOrigins = parsed.TRUSTED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean);
  if (trustedOrigins.length === 0) throw new Error("at least one trusted origin is required");
  for (const origin of trustedOrigins) new URL(origin);

  if (parsed.NODE_ENV === "production" && parsed.BETTER_AUTH_SECRET.includes("local-only")) {
    throw new Error("production cannot use a development authentication secret");
  }

  return Object.freeze({
    environment: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    authDatabaseUrl: parsed.AUTH_DATABASE_URL,
    betterAuthUrl: parsed.BETTER_AUTH_URL,
    betterAuthSecret: parsed.BETTER_AUTH_SECRET,
    trustedOrigins: Object.freeze(trustedOrigins),
  });
}
