import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { BullMqAuthorityTransport } from "../../packages/platform/queue/src/bullmq-authority-transport.ts";

const redisUrl = process.env.REDIS_URL;

test("BullMQ transports authority event ids without becoming the source of truth", { skip: !redisUrl }, async () => {
  const queueName = `m12-authority-${randomUUID()}`;
  const transport = new BullMqAuthorityTransport(redisUrl!, queueName);
  const eventId = randomUUID();
  let received = 0;
  let resolveDelivery!: () => void;
  const delivered = new Promise<void>((resolve) => { resolveDelivery = resolve; });

  try {
    await transport.start(async (name, data) => {
      assert.equal(name, "verification.requested");
      assert.deepEqual(data, { eventId });
      received += 1;
      resolveDelivery();
    }, 1);

    await transport.publish("verification.requested", eventId);
    await Promise.race([
      delivered,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("BullMQ delivery timed out")), 5_000)),
    ]);

    assert.equal(received, 1);
  } finally {
    await transport.close();
  }
});

test("BullMQ authority transport rejects non-Redis endpoints", () => {
  assert.throws(() => new BullMqAuthorityTransport("https://example.invalid"), /REDIS_URL/);
});
