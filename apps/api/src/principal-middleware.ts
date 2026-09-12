import type { NextFunction, Request, Response } from "express";
import { tenantHeaderSchema } from "../../../packages/contracts/src/api.ts";
import type { SecurityAuditSink } from "../../../packages/platform/audit/src/security-audit.ts";
import type { HumanPrincipal, MembershipDirectory } from "../../../packages/platform/auth/src/principal.ts";
import { resolveHumanPrincipal } from "../../../packages/platform/auth/src/principal.ts";
import type { SessionRuntime } from "../../../packages/platform/auth/src/session-runtime.ts";
import { writeProblem } from "./problem-details.ts";

export type PrincipalRequest = Request & { principal?: HumanPrincipal };

export function principalMiddleware(
  sessionRuntime: SessionRuntime,
  directory: MembershipDirectory,
  auditSink?: SecurityAuditSink,
) {
  return async (request: PrincipalRequest, response: Response, next: NextFunction): Promise<void> => {
    let tenantId: string | undefined;
    let authUserId: string | undefined;
    try {
      tenantId = tenantHeaderSchema.parse(request.header("x-tenant-id"));
      const session = await sessionRuntime.getSession(request.headers);
      authUserId = session?.authUserId;
      request.principal = await resolveHumanPrincipal(session, tenantId, directory);
      next();
    } catch (error) {
      if (auditSink) {
        try {
          await auditSink.record({
            ...(tenantId ? { tenantId } : {}),
            actorType: authUserId ? "HUMAN" : "UNRESOLVED",
            ...(authUserId ? { actorId: authUserId } : {}),
            action: "AUTH_PRINCIPAL_RESOLUTION_DENIED",
            resourceType: "TENANT",
            metadata: {
              method: request.method,
              path: request.path,
              errorType: error instanceof Error ? error.name : "UnknownError",
            },
            occurredAt: new Date(),
          });
        } catch {
          // Audit persistence failure must not replace the original security response.
          // Observability for sink failures is handled at the platform logging layer.
        }
      }
      writeProblem(response, error);
    }
  };
}
