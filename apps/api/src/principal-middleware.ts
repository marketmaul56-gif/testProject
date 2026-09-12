import type { NextFunction, Request, Response } from "express";
import { tenantHeaderSchema } from "../../../packages/contracts/src/api.ts";
import type { HumanPrincipal, MembershipDirectory } from "../../../packages/platform/auth/src/principal.ts";
import { resolveHumanPrincipal } from "../../../packages/platform/auth/src/principal.ts";
import type { SessionRuntime } from "../../../packages/platform/auth/src/session-runtime.ts";
import { writeProblem } from "./problem-details.ts";

export type PrincipalRequest = Request & { principal?: HumanPrincipal };

export function principalMiddleware(sessionRuntime: SessionRuntime, directory: MembershipDirectory) {
  return async (request: PrincipalRequest, response: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = tenantHeaderSchema.parse(request.header("x-tenant-id"));
      const session = await sessionRuntime.getSession(request.headers);
      request.principal = await resolveHumanPrincipal(session, tenantId, directory);
      next();
    } catch (error) {
      writeProblem(response, error);
    }
  };
}
