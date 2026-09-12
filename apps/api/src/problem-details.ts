import type { Response } from "express";
import { AuthenticationRequiredError, PlatformAdminMfaRequiredError, TenantMembershipRequiredError } from "../../../packages/platform/auth/src/principal.ts";
import { AuthorizationDeniedError } from "../../../packages/platform/auth/src/policy.ts";

export type ProblemDetails = Readonly<{
  type: string;
  title: string;
  status: number;
  detail: string;
}>;

export function problemFor(error: unknown): ProblemDetails {
  if (error instanceof AuthenticationRequiredError) return { type: "urn:problem:authentication-required", title: "Authentication required", status: 401, detail: error.message };
  if (error instanceof TenantMembershipRequiredError) return { type: "urn:problem:tenant-access-denied", title: "Tenant access denied", status: 403, detail: error.message };
  if (error instanceof PlatformAdminMfaRequiredError) return { type: "urn:problem:admin-mfa-required", title: "Administrator MFA required", status: 403, detail: error.message };
  if (error instanceof AuthorizationDeniedError) return { type: "urn:problem:authorization-denied", title: "Authorization denied", status: 403, detail: "The authenticated principal is not authorized for this resource." };
  return { type: "urn:problem:internal", title: "Internal server error", status: 500, detail: "The request could not be completed." };
}

export function writeProblem(response: Response, error: unknown): void {
  const problem = problemFor(error);
  response.status(problem.status).type("application/problem+json").json(problem);
}
