import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { z } from "zod";
import { PgCompetencyAuthority } from "../../../packages/modules/competency/src/infrastructure/pg-authority.ts";
import { VerificationDispatcherService } from "../../../packages/modules/verification/src/application/authority.ts";
import { PgVerificationAuthority } from "../../../packages/modules/verification/src/infrastructure/pg-authority.ts";
import { PgRuntimeVerificationQueue } from "../../../packages/modules/verification/src/infrastructure/pg-runtime-queue.ts";
import { BullMqAuthorityTransport } from "../../../packages/platform/queue/src/bullmq-authority-transport.ts";
import { AuthorityWorker } from "./authority-worker.ts";
import { HttpVerifierExecutor } from "./http-verifier-executor.ts";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  VERIFIER_DISPATCHER_URL: z.string().url(),
  VERIFIER_DISPATCHER_TOKEN: z.string().min(32),
  WORKER_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(500),
}).passthrough();

export async function bootstrapWorker(): Promise<void> {
  const config = schema.parse(process.env);
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const runtimeQueue = new PgRuntimeVerificationQueue(pool);
  const executor = new HttpVerifierExecutor(config.VERIFIER_DISPATCHER_URL, config.VERIFIER_DISPATCHER_TOKEN);
  const worker = new AuthorityWorker(
    runtimeQueue,
    new VerificationDispatcherService(new PgVerificationAuthority(pool), executor),
    new PgCompetencyAuthority(pool),
  );
  const transport = new BullMqAuthorityTransport(config.REDIS_URL);

  let stopped = false;
  const stop = () => { stopped = true; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  await transport.start(async (name, data) => {
    const result = await worker.processJob(name, data.eventId);
    if (result.verificationProcessed || result.verificationErrors || result.evidenceProcessed) {
      console.log(JSON.stringify({ event: "authority_worker_delivery", authorityEventId: data.eventId, name, ...result }));
    }
  });

  try {
    while (!stopped) {
      try {
        for (const event of await runtimeQueue.listVerificationRequests()) {
          await transport.publish("verification.requested", event.eventId);
        }
        for (const eventId of await runtimeQueue.listPassedEvents()) {
          await transport.publish("verification.passed", eventId);
        }
      } catch (error) {
        // PostgreSQL outbox remains canonical. A relay/Redis outage leaves the
        // event unpublished so the next iteration can safely republish it.
        console.error(JSON.stringify({
          event: "authority_delivery_relay_error",
          message: error instanceof Error ? error.message : "unknown relay error",
        }));
      }
      await delay(config.WORKER_POLL_MS, undefined, { ref: true });
    }
  } finally {
    await transport.close();
    await pool.end();
  }
}

if (process.env.NODE_ENV !== "test") {
  void bootstrapWorker();
}
