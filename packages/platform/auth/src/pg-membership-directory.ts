import type { Pool } from "pg";
import type { HumanRole, MembershipDirectory, MembershipRecord } from "./principal.ts";

const allowedRoles = new Set<HumanRole>(["LEARNER", "INSTRUCTOR", "PLATFORM_ADMIN"]);

export class PgMembershipDirectory implements MembershipDirectory {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async findByAuthUserAndTenant(authUserId: string, tenantId: string): Promise<MembershipRecord | null> {
    const result = await this.pool.query<{ id: string; tenant_id: string; roles: string[] | null }>(
      `SELECT m.id, m.tenant_id, COALESCE(array_agg(mr.role::text) FILTER (WHERE mr.role IS NOT NULL), '{}') AS roles
         FROM members m
         LEFT JOIN member_roles mr ON mr.tenant_id = m.tenant_id AND mr.member_id = m.id
        WHERE m.auth_user_id = $1 AND m.tenant_id = $2
        GROUP BY m.id, m.tenant_id
        LIMIT 1`,
      [authUserId, tenantId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const roles = (row.roles ?? []).filter((role): role is HumanRole => allowedRoles.has(role as HumanRole));
    return Object.freeze({ tenantId: row.tenant_id, memberId: row.id, roles: Object.freeze(roles) });
  }
}
