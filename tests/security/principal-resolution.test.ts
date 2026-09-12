import test from "node:test";
import assert from "node:assert/strict";
import { PlatformAdminMfaRequiredError, TenantMembershipRequiredError, resolveHumanPrincipal, type MembershipDirectory } from "../../packages/platform/auth/src/principal.ts";

const directory: MembershipDirectory = {
  async findByAuthUserAndTenant(authUserId, tenantId) {
    if (authUserId === "admin" && tenantId === "t-a") return { tenantId, memberId: "m-admin", roles: ["PLATFORM_ADMIN"] };
    if (authUserId === "learner" && tenantId === "t-a") return { tenantId, memberId: "m-learner", roles: ["LEARNER"] };
    return null;
  },
};

test("requested tenant is validated against actual membership", async () => {
  await assert.rejects(() => resolveHumanPrincipal({ authUserId: "learner", twoFactorEnabled: false }, "t-b", directory), TenantMembershipRequiredError);
});

test("platform admin without enabled TOTP is rejected", async () => {
  await assert.rejects(() => resolveHumanPrincipal({ authUserId: "admin", twoFactorEnabled: false }, "t-a", directory), PlatformAdminMfaRequiredError);
});

test("platform admin with enabled TOTP resolves tenant-scoped principal", async () => {
  const principal = await resolveHumanPrincipal({ authUserId: "admin", twoFactorEnabled: true }, "t-a", directory);
  assert.deepEqual(principal.roles, ["PLATFORM_ADMIN"]);
  assert.equal(principal.tenantId, "t-a");
});
