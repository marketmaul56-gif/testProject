import { randomBytes } from "node:crypto";
import type { Pool } from "pg";

export type SecurityAuditEvent = Readonly<{
  tenantId?: string;
  actorType: "HUMAN" | "SYSTEM" | "UNRESOLVED";
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
  occurredAt: Date;
}>;

export interface SecurityAuditSink {
  record(event: SecurityAuditEvent): Promise<void>;
}

export function uuidV7(now = Date.now()): string {
  if (!Number.isSafeInteger(now) || now < 0 || now > 0xffffffffffff) throw new RangeError("UUIDv7 timestamp out of range");
  const bytes = randomBytes(16);
  let timestamp = BigInt(now);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class PgSecurityAuditSink implements SecurityAuditSink {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async record(event: SecurityAuditEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_events
         (id, tenant_id, actor_type, actor_id, action, resource_type, resource_id, metadata, occurred_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [
        uuidV7(event.occurredAt.getTime()),
        event.tenantId ?? null,
        event.actorType,
        event.actorId ?? null,
        event.action,
        event.resourceType,
        event.resourceId ?? null,
        JSON.stringify(event.metadata ?? {}),
        event.occurredAt,
      ],
    );
  }
}
