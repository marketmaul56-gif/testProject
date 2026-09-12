import { z } from "zod";
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
}).passthrough();

export async function bootstrapVerifierDispatcher(): Promise<void> {
  const config = schema.parse(process.env);
  const policy = createVerifierSandboxPolicy(config.VERIFIER_RUNTIME_IMAGE_DIGEST);
  const bundles = new LocalVerifierBundleFactory(
    config.VERIFIER_ROOTFS_DIR,
    config.VERIFIER_HIDDEN_BUNDLES_ROOT,
    config.VERIFIER_ARTIFACT_STAGING_ROOT ?? null,
  );
  const server = createVerifierDispatcherServer(new RunscVerifierExecutor(policy, bundles), config.VERIFIER_DISPATCHER_TOKEN);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.PORT, "0.0.0.0", () => resolve());
  });
  const shutdown = () => server.close();
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

if (process.env.NODE_ENV !== "test") {
  void bootstrapVerifierDispatcher();
}
