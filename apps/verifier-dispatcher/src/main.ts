import { z } from "zod";
import { startTelemetry } from "../../../packages/platform/observability/src/telemetry.ts";
import { S3ObjectStorage } from "../../../packages/platform/storage/src/s3-object-storage.ts";
import { LocalVerifierBundleFactory } from "./bundle-factory.ts";
import { RunscVerifierExecutor } from "./runsc-executor.ts";
import { createVerifierSandboxPolicy } from "./sandbox-policy.ts";
import { createVerifierDispatcherServer } from "./server.ts";

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3010),
  VERIFIER_DISPATCHER_TOKEN: z.string().min(32),
  VERIFIER_RUNTIME_IMAGE_DIGEST: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  VERIFIER_ROOTFS_DIR: z.string().min(1),
  VERIFIER_HIDDEN_BUNDLES_ROOT: z.string().min(1),
  VERIFIER_ARTIFACT_STAGING_ROOT: z.string().min(1).optional(),
  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_REGION: z.string().min(1),
  OBJECT_STORAGE_BUCKET: z.string().min(3),
  OBJECT_STORAGE_ACCESS_KEY_ID: z.string().min(1).optional(),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  OBJECT_STORAGE_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
}).passthrough().superRefine((value, ctx) => {
  if (Boolean(value.OBJECT_STORAGE_ACCESS_KEY_ID) !== Boolean(value.OBJECT_STORAGE_SECRET_ACCESS_KEY)) {
    ctx.addIssue({ code: "custom", path: ["OBJECT_STORAGE_ACCESS_KEY_ID"], message: "object storage credentials must be configured together" });
  }
});

export async function bootstrapVerifierDispatcher(): Promise<void> {
  const telemetry = startTelemetry("skill-platform-verifier-dispatcher");
  const config = schema.parse(process.env);
  const policy = createVerifierSandboxPolicy(config.VERIFIER_RUNTIME_IMAGE_DIGEST);
  const storage = new S3ObjectStorage({
    endpoint: config.OBJECT_STORAGE_ENDPOINT,
    region: config.OBJECT_STORAGE_REGION,
    bucket: config.OBJECT_STORAGE_BUCKET,
    forcePathStyle: config.OBJECT_STORAGE_FORCE_PATH_STYLE === "true",
    accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY_ID ?? null,
    secretAccessKey: config.OBJECT_STORAGE_SECRET_ACCESS_KEY ?? null,
  });
  const bundles = new LocalVerifierBundleFactory(
    config.VERIFIER_ROOTFS_DIR,
    config.VERIFIER_HIDDEN_BUNDLES_ROOT,
    config.VERIFIER_ARTIFACT_STAGING_ROOT ?? null,
    { materialize: (objectKey, target, maxBytes) => storage.downloadToFile(objectKey, target, maxBytes) },
  );
  const server = createVerifierDispatcherServer(new RunscVerifierExecutor(policy, bundles), config.VERIFIER_DISPATCHER_TOKEN);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.PORT, "0.0.0.0", () => resolve());
  });
  const shutdown = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    storage.destroy();
    await telemetry.shutdown();
  };
  process.once("SIGTERM", () => { void shutdown(); });
  process.once("SIGINT", () => { void shutdown(); });
}

if (process.env.NODE_ENV !== "test") {
  void bootstrapVerifierDispatcher();
}
