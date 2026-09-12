import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { z } from "zod";
import { PgCompetencyAuthority } from "../../../packages/modules/competency/src/infrastructure/pg-authority.ts";
import { VerificationDispatcherService } from "../../../packages/modules/verification/src/application/authority.ts";
import { PgVerificationAuthority } from "../../../packages/modules/verification/src/infrastructure/pg-authority.ts";
import { PgRuntimeVerificationQueue } from "../../../packages/modules/verification/src/infrastructure/pg-runtime-queue.ts";
import { AuthorityWorker } from "./authority-worker.ts";
import { HttpVerifierExecutor } from "./http-verifier-executor.ts";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  VERIFIER_DISPATCHER_URL: z.string().url(),
  VERIFIER_DISPATCHER_TOKEN: z.string().min(32),
  WORKER_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(500),
}).passthrough();

export async function bootstrapWorker(): Promise<void> {
  const config = schema.parse(process.env);
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const executor = new HttpVerifierExecutor(config.VERIFIER_DISPATCHER_URL, config.VERIFIER_DISPATCHER_TOKEN);
  const worker = new AuthorityWorker(
    new PgRuntimeVerificationQueue(pool),
    new VerificationDispatcherService(new PgVerificationAuthority(pool), executor),
    new PgCompetencyAuthority(pool),
  );
  let stopped = false;
  const stop = () => { stopped = true; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  try {
    while (!stopped) {
      const result = await worker.runOnce();
      if (result.verificationProcessed || result.evidenceProcessed || result.deliveryFailures) {
        console.log(JSON.stringify({ event: "authority_worker_iteration", ...result }));
      }
      await delay(config.WORKER_POLL_MS, undefined, { ref: true });
    }
  } finally {
    await pool.end();
  }
}

if (process.env.NODE_ENV !== "test") {
  void bootstrapWorker();
}
