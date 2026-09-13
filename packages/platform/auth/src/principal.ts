export type HumanRole = "LEARNER" | "INSTRUCTOR" | "PLATFORM_ADMIN";
export type SystemActor = "VERIFIER" | "EVIDENCE_ISSUER" | "COMPETENCY_PROJECTOR" | "WORKER";

export type HumanPrincipal = Readonly<{
  kind: "human";
  authUserId: string;
  tenantId: string;
  memberId: string;
  roles: readonly HumanRole[];
}>;

export type SystemPrincipal = Readonly<{
  kind: "system";
  actor: SystemActor;
  tenantId: string;
}>;

export type ApplicationPrincipal = HumanPrincipal | SystemPrincipal;

export type AuthSessionSnapshot = Readonly<{
  authUserId: string;
  twoFactorEnabled: boolean;
}>;

export type MembershipRecord = Readonly<{
  tenantId: string;
  memberId: string;
  roles: readonly HumanRole[];
}>;

export interface MembershipDirectory {
  findByAuthUserAndTenant(authUserId: string, tenantId: string): Promise<MembershipRecord | null>;
}

export class AuthenticationRequiredError extends Error {
  constructor(message = "authentication is required") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export class TenantMembershipRequiredError extends Error {
  constructor() {
    super("authenticated identity is not a member of the requested tenant");
    this.name = "TenantMembershipRequiredError";
  }
}

export class PlatformAdminMfaRequiredError extends Error {
  constructor() {
    super("platform administrator requires TOTP two-factor authentication");
    this.name = "PlatformAdminMfaRequiredError";
  }
}

export async function resolveHumanPrincipal(
  session: AuthSessionSnapshot | null,
  requestedTenantId: string,
  directory: MembershipDirectory,
): Promise<HumanPrincipal> {
  if (!session) throw new AuthenticationRequiredError();
  if (!requestedTenantId) throw new TenantMembershipRequiredError();

  const membership = await directory.findByAuthUserAndTenant(session.authUserId, requestedTenantId);
  if (!membership || membership.tenantId !== requestedTenantId) throw new TenantMembershipRequiredError();

  if (membership.roles.includes("PLATFORM_ADMIN") && !session.twoFactorEnabled) {
    throw new PlatformAdminMfaRequiredError();
  }

  return Object.freeze({
    kind: "human" as const,
    authUserId: session.authUserId,
    tenantId: membership.tenantId,
    memberId: membership.memberId,
    roles: Object.freeze([...membership.roles]),
  });
}
