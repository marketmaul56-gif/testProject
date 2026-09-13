import test from "node:test";
import assert from "node:assert/strict";
import { prohibitTrustedDeviceBypass } from "../../packages/platform/auth/src/trusted-device.ts";

test("TOTP verification cannot request trusted-device bypass", () => {
  const body: Record<string, unknown> = { code: "123456", trustDevice: true };
  prohibitTrustedDeviceBypass("/two-factor/verify-totp", body);
  assert.equal(body.trustDevice, false);
});

test("backup-code verification cannot request trusted-device bypass", () => {
  const body: Record<string, unknown> = { code: "backup", trustDevice: true };
  prohibitTrustedDeviceBypass("/two-factor/verify-backup-code", body);
  assert.equal(body.trustDevice, false);
});
