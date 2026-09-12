import type { ApplicationPrincipal, HumanPrincipal, SystemPrincipal } from "./principal.ts";

export type Action =
  | "learning:read"
  | "submission:create"
  | "submission:read"
  | "evidence:read"
  | "competency:read"
  | "cohort:read"
  | "cohort:manage"
  | "guidance:create"
  | "verification:write"
  | "evidence:issue"
  | "competency:project";

export type ResourceScope = Readonly<{
  tenantId: string;
  ownerMemberId?: string;
  learnerMemberId?: string;
  authorizedMemberIds?: readonly string[];
  authorizedInstructorIds?: readonly string[];
}>;

export type PolicyDecision = Readonly<{ allowed: true }> | Readonly<{ allowed: false; reason: string }>;

const authorityActions = new Set<Action>(["verification:write", "evidence:issue", "competency:project"]);

function deny(reason: string): PolicyDecision {
  return Object.freeze({ allowed: false as const, reason });
}

function allow(): PolicyDecision {
  return Object.freeze({ allowed: true as const });
}

function authorizeSystem(principal: SystemPrincipal, action: Action, resource: ResourceScope): PolicyDecision {
  if (principal.tenantId !== resource.tenantId) return deny("cross-tenant system access denied");
  if (action === "verification:write" && principal.actor === "VERIFIER") return allow();
  if (action === "evidence:issue" && principal.actor === "EVIDENCE_ISSUER") return allow();
  if (action === "competency:project" && principal.actor === "COMPETENCY_PROJECTOR") return allow();
  return deny("system actor lacks canonical authority");
}

function isRelatedLearner(principal: HumanPrincipal, resource: ResourceScope): boolean {
  return resource.ownerMemberId === principal.memberId || resource.learnerMemberId === principal.memberId || resource.authorizedMemberIds?.includes(principal.memberId) === true;
}

function isRelatedInstructor(principal: HumanPrincipal, resource: ResourceScope): boolean {
  return resource.authorizedInstructorIds?.includes(principal.memberId) === true;
}

export function authorize(principal: ApplicationPrincipal, action: Action, resource: ResourceScope): PolicyDecision {
  if (principal.kind === "system") return authorizeSystem(principal, action, resource);
  if (principal.tenantId !== resource.tenantId) return deny("cross-tenant access denied");

  // Humans never enter the canonical write-authority chain, including platform admins.
  if (authorityActions.has(action)) return deny("human principal cannot exercise competence authority");

  if (principal.roles.includes("PLATFORM_ADMIN")) return allow();

  if (principal.roles.includes("INSTRUCTOR") && isRelatedInstructor(principal, resource)) {
    if (["learning:read", "submission:read", "evidence:read", "competency:read", "cohort:read", "cohort:manage", "guidance:create"].includes(action)) return allow();
  }

  if (principal.roles.includes("LEARNER") && isRelatedLearner(principal, resource)) {
    if (["learning:read", "submission:create", "submission:read", "evidence:read", "competency:read"].includes(action)) return allow();
  }

  return deny("default deny: no authorized role/resource relationship");
}

export class AuthorizationDeniedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.reason = reason;
    this.name = "AuthorizationDeniedError";
  }
}

export function assertAuthorized(principal: ApplicationPrincipal, action: Action, resource: ResourceScope): void {
  const decision = authorize(principal, action, resource);
  if (!decision.allowed) throw new AuthorizationDeniedError(decision.reason);
}
