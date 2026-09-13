export class TenantBoundaryError extends Error {
  constructor() {
    super("cross-tenant reference is not allowed");
    this.name = "TenantBoundaryError";
  }
}

export function assertSameTenant(expectedTenantId: string, actualTenantId: string): void {
  if (!expectedTenantId || expectedTenantId !== actualTenantId) {
    throw new TenantBoundaryError();
  }
}
