import { z } from "zod";

const postgresUrl = z.string().url().refine((value) => value.startsWith("postgresql://") || value.startsWith("postgres://"), {
  message: "must be a PostgreSQL URL",
});

// Validate the application-owned configuration contract without treating
// unrelated host/runner environment variables as application input errors.
const environmentSchema = z.object({
  NODE_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: postgresUrl,
  AUTH_DATABASE_URL: postgresUrl,
  BETTER_AUTH_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  TRUSTED_ORIGINS: z.string().min(1),
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  OPENAI_MODEL: z.string().trim().min(1).optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(8_000),
}).passthrough().superRefine((value, ctx) => {
  const hasKey = Boolean(value.OPENAI_API_KEY);
  const hasModel = Boolean(value.OPENAI_MODEL);
  if (hasKey !== hasModel) {
    ctx.addIssue({
      code: "custom",
      path: [hasKey ? "OPENAI_MODEL" : "OPENAI_API_KEY"],
      message: "OPENAI_API_KEY and OPENAI_MODEL must be configured together",
    });
  }
});

export type RuntimeConfig = Readonly<{
  environment: "local" | "test" | "staging" | "production";
  port: number;
  databaseUrl: string;
  authDatabaseUrl: string;
  betterAuthUrl: string;
  betterAuthSecret: string;
  trustedOrigins: readonly string[];
  ai: Readonly<{
    enabled: boolean;
    apiKey: string | null;
    model: string | null;
    timeoutMs: number;
  }>;
}>;

export function loadRuntimeConfig(input: Record<string, string | undefined>): RuntimeConfig {
  const parsed = environmentSchema.parse(input);
  const trustedOrigins = parsed.TRUSTED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean);
  if (trustedOrigins.length === 0) throw new Error("at least one trusted origin is required");
  for (const origin of trustedOrigins) {
    const url = new URL(origin);
    if (url.origin !== origin.replace(/\/$/, "")) throw new Error(`trusted origin must not include a path: ${origin}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`unsupported trusted origin protocol: ${origin}`);
  }

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
    ai: Object.freeze({
      enabled: Boolean(parsed.OPENAI_API_KEY && parsed.OPENAI_MODEL),
      apiKey: parsed.OPENAI_API_KEY ?? null,
      model: parsed.OPENAI_MODEL ?? null,
      timeoutMs: parsed.AI_TIMEOUT_MS,
    }),
  });
}
