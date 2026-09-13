import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { z } from "zod";
import type { VerifierExecutor } from "../../../packages/modules/verification/src/application/authority.ts";

const requestSchema = z.object({
  tenantId: z.string().uuid(),
  attemptId: z.string().uuid(),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("PRACTICE"), submissionId: z.string().uuid() }).strict(),
    z.object({ kind: z.literal("PROJECT"), submissionId: z.string().uuid() }).strict(),
  ]),
  artifactRef: z.string().min(1).max(400_000),
  hiddenTestBundleRef: z.string().min(1).max(2_048),
  verifierKey: z.string().min(1).max(100),
  verifierVersion: z.string().min(1).max(100),
}).strict();

function tokenMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > 512 * 1024) throw new Error("request body limit exceeded");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(value));
}

export function createVerifierDispatcherServer(executor: VerifierExecutor, token: string): Server {
  if (token.length < 32) throw new Error("dispatcher token must contain at least 32 characters");
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      json(response, 200, { status: "ok" });
      return;
    }
    if (request.method !== "POST" || request.url !== "/internal/v1/verify") {
      json(response, 404, { error: "not_found" });
      return;
    }
    if (!tokenMatches(request.headers["x-dispatcher-token"] as string | undefined, token)) {
      json(response, 401, { error: "unauthorized" });
      return;
    }
    try {
      const input = requestSchema.parse(await readBody(request));
      const result = await executor.execute(input);
      json(response, 200, result);
    } catch {
      // Never echo hidden references, learner source, sandbox stderr, or verifier secrets.
      json(response, 503, { error: "verifier_unavailable" });
    }
  });
}
