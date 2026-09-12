import assert from "node:assert/strict";
import test from "node:test";
import type { Response } from "express";
import { createReadinessHandler, type ReadinessDependency } from "../../apps/api/src/health.ts";

function responseRecorder() {
  const state: { statusCode: number | null; body: unknown } = { statusCode: null, body: null };
  const response = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  } as unknown as Response;
  return { response, state };
}

const healthy: ReadinessDependency = { async query() { return {}; } };

test("readiness returns 200 only when both application and auth databases respond", async () => {
  const { response, state } = responseRecorder();
  await createReadinessHandler(healthy, healthy)({}, response);
  assert.equal(state.statusCode, 200);
  assert.deepEqual(state.body, { status: "ready" });
});

test("readiness returns sanitized 503 when a dependency is unavailable", async () => {
  const unavailable: ReadinessDependency = {
    async query() {
      throw new Error("postgresql://user:secret@example.invalid/private");
    },
  };
  const { response, state } = responseRecorder();
  await createReadinessHandler(healthy, unavailable)({}, response);
  assert.equal(state.statusCode, 503);
  assert.deepEqual(state.body, { status: "unavailable" });
  assert.equal(JSON.stringify(state.body).includes("secret"), false);
});
