import { Queue, Worker } from "bullmq";

export type AuthorityJobName = "verification.requested" | "verification.passed";
export type AuthorityJobData = Readonly<{ eventId: string }>;
export type AuthorityJobHandler = (name: AuthorityJobName, data: AuthorityJobData) => Promise<void>;

function redisConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use redis:// or rediss://");
  }
  const dbText = url.pathname.replace(/^\//, "");
  const db = dbText.length === 0 ? 0 : Number(dbText);
  if (!Number.isInteger(db) || db < 0) throw new Error("REDIS_URL contains an invalid database number");
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    db,
    maxRetriesPerRequest: null,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

/**
 * Redis/BullMQ is delivery infrastructure only. PostgreSQL outbox state remains
 * the correctness/source-of-truth boundary. Jobs are removed after every
 * delivery attempt so an unpublished DB event can be re-enqueued safely.
 */
export class BullMqAuthorityTransport {
  private readonly queue: Queue<AuthorityJobData, void, AuthorityJobName>;
  private readonly connection: ReturnType<typeof redisConnection>;
  private worker: Worker<AuthorityJobData, void, AuthorityJobName> | null = null;

  constructor(redisUrl: string, queueName = "verification") {
    this.connection = redisConnection(redisUrl);
    this.queue = new Queue<AuthorityJobData, void, AuthorityJobName>(queueName, {
      connection: this.connection,
    });
  }

  async publish(name: AuthorityJobName, eventId: string): Promise<void> {
    await this.queue.add(name, { eventId }, {
      jobId: eventId,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    });
  }

  async start(handler: AuthorityJobHandler, concurrency = 4): Promise<void> {
    if (this.worker) throw new Error("authority transport worker is already started");
    this.worker = new Worker<AuthorityJobData, void, AuthorityJobName>(
      this.queue.name,
      async (job) => handler(job.name, job.data),
      { connection: this.connection, concurrency },
    );
    await this.worker.waitUntilReady();
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await this.queue.close();
  }
}
