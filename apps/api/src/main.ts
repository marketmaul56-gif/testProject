import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import cors from "cors";
import express from "express";
import { toNodeHandler } from "better-auth/node";
import { Pool } from "pg";
import { PgSecurityAuditSink } from "../../../packages/platform/audit/src/security-audit.ts";
import { createBetterAuth } from "../../../packages/platform/auth/src/better-auth.ts";
import { PgMembershipDirectory } from "../../../packages/platform/auth/src/pg-membership-directory.ts";
import { createSessionRuntime } from "../../../packages/platform/auth/src/session-runtime.ts";
import { loadRuntimeConfig } from "../../../packages/platform/config/src/config.ts";
import { AppModule } from "./app.module.ts";
import { principalMiddleware } from "./principal-middleware.ts";
import { ProblemDetailsFilter } from "./problem-details.filter.ts";

export async function bootstrap(): Promise<void> {
  const config = loadRuntimeConfig(process.env);
  const server = express();
  const { auth, pool: authPool } = createBetterAuth(config);
  const applicationPool = new Pool({ connectionString: config.databaseUrl });

  server.use(cors({
    origin(origin, callback) {
      if (!origin || config.trustedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("origin is not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }));

  // Better Auth must receive the raw request stream before JSON body parsing.
  server.all("/api/auth/*splat", toNodeHandler(auth));
  server.use(express.json({ limit: "256kb" }));
  server.get("/healthz", (_request, response) => response.status(200).json({ status: "ok" }));

  const sessionRuntime = createSessionRuntime(auth);
  const membershipDirectory = new PgMembershipDirectory(applicationPool);
  const securityAuditSink = new PgSecurityAuditSink(applicationPool);
  server.use("/api/v1", principalMiddleware(sessionRuntime, membershipDirectory, securityAuditSink));

  const app = await NestFactory.create(AppModule.forRoot(applicationPool), new ExpressAdapter(server), { bodyParser: false });
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();

  const closePools = async () => {
    await Promise.allSettled([applicationPool.end(), authPool.end()]);
  };
  process.once("SIGTERM", () => { void closePools(); });
  process.once("SIGINT", () => { void closePools(); });

  await app.listen(config.port);
}

if (process.env.NODE_ENV !== "test") {
  void bootstrap();
}
