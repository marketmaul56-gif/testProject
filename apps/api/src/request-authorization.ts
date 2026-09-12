import type { PrincipalRequest } from "./principal-middleware.ts";
import { AuthenticationRequiredError } from "../../../packages/platform/auth/src/principal.ts";
import { assertAuthorized, type Action, type ResourceScope } from "../../../packages/platform/auth/src/policy.ts";

export function authorizeRequest(request: PrincipalRequest, action: Action, resource: ResourceScope): void {
  const principal = request.principal;
  if (!principal) throw new AuthenticationRequiredError();
  assertAuthorized(principal, action, resource);
}
