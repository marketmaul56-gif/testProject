import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { Pool } from "pg";
import type { RuntimeConfig } from "../../config/src/config.ts";
import { prohibitTrustedDeviceBypass } from "./trusted-device.ts";

export function createBetterAuth(config: RuntimeConfig) {
  const pool = new Pool({ connectionString: config.authDatabaseUrl });

  const auth = betterAuth({
    appName: "AI-Native Skill Learning Platform",
    baseURL: config.betterAuthUrl,
    basePath: "/api/auth",
    secret: config.betterAuthSecret,
    database: pool,
    trustedOrigins: [...config.trustedOrigins],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      cookieCache: { enabled: false },
    },
    advanced: {
      database: { joins: true },
    },
    telemetry: { enabled: false },
    plugins: [twoFactor({ issuer: "AI-Native Skill Learning Platform" })],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        prohibitTrustedDeviceBypass(ctx.path, ctx.body);
      }),
    },
  });

  return { auth, pool } as const;
}
