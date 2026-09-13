-- M12.3 authorization state. Roles are application-owned; Better Auth authenticates identity only.
CREATE TYPE member_role AS ENUM ('LEARNER', 'INSTRUCTOR', 'PLATFORM_ADMIN');

CREATE TABLE member_roles (
  tenant_id uuid NOT NULL,
  member_id uuid NOT NULL,
  role member_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, member_id, role),
  CONSTRAINT member_roles_member_same_tenant_fk
    FOREIGN KEY (tenant_id, member_id) REFERENCES members(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX member_roles_tenant_role_idx ON member_roles (tenant_id, role);

COMMENT ON TABLE member_roles IS 'Application-owned authorization roles. Authentication provider data is never permission authority.';
