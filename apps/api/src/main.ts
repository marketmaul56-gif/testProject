import "reflect-metadata";
import { metrics, SpanStatusCode, trace } from "@opentelemetry/api";
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
import { startTelemetry } from "../../../packages/platform/observability/src/telemetry.ts";
import { AppModule } from "./app.module.ts";
import { createReadinessHandler } from "./health.ts";
import { principalMiddleware } from "./principal-middleware.ts";
import { ProblemDetailsFilter } from "./problem-details.filter.ts";

const apiTracer = trace.getTracer("skill-platform-api");
const apiMeter = metrics.getMeter("skill-platform-api");
const requestDuration = apiMeter.createHistogram("http.server.duration.ms", { unit: "ms" });

export async function bootstrap(): Promise<void> {
  const telemetry = startTelemetry("skill-platform-api");
  const config = loadRuntimeConfig(process.env);
  const server = express();
  const { auth, pool: authPool } = createBetterAuth(config);
  const applicationPool = new Pool({ connectionString: config.databaseUrl });

  server.use((request, response, next) => {
    const started = performance.now();
    const span = apiTracer.startSpan("http.server.request", { attributes: { "http.request.method": request.method } });
    response.once("finish", () => {
      const durationMs = performance.now() - started;
      requestDuration.record(durationMs, { "http.request.method": request.method, "http.response.status_code": response.statusCode });
      span.setAttribute("http.response.status_code", response.statusCode);
      span.setStatus({ code: response.statusCode >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK });
      span.end();
    });
    next();
  });

  server.use(cors({
    origin(origin, callback) {
      if (!origin || config.trustedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("origin is not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }));

  server.all("/api/auth/*splat", toNodeHandler(auth));
  server.use(express.json({ limit: "256kb" }));
  server.get("/healthz", (_request, response) => response.status(200).json({ status: "ok" }));
  server.get("/readyz", createReadinessHandler(applicationPool, authPool));

  const sessionRuntime = createSessionRuntime(auth);
  const membershipDirectory = new PgMembershipDirectory(applicationPool);
  const securityAuditSink = new PgSecurityAuditSink(applicationPool);
  server.use("/api/v1", principalMiddleware(sessionRuntime, membershipDirectory, securityAuditSink));

  const app = await NestFactory.create(AppModule.forRoot(applicationPool, config), new ExpressAdapter(server), { bodyParser: false });
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();

  const closeRuntime = async () => {
    await Promise.allSettled([applicationPool.end(), authPool.end(), telemetry.shutdown()]);
  };
  process.once("SIGTERM", () => { void closeRuntime(); });
  process.once("SIGINT", () => { void closeRuntime(); });

  await app.listen(config.port);
}

if (process.env.NODE_ENV !== "test") {
  void bootstrap();
}
