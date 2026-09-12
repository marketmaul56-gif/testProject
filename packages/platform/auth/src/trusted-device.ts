const twoFactorVerificationPaths = new Set([
  "/two-factor/verify-totp",
  "/two-factor/verify-otp",
  "/two-factor/verify-backup-code",
]);

export function prohibitTrustedDeviceBypass(path: string, body: unknown): void {
  if (!twoFactorVerificationPaths.has(path)) return;
  if (!body || typeof body !== "object") return;
  Object.assign(body as Record<string, unknown>, { trustDevice: false });
}
