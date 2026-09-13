#!/usr/bin/env bash
set -euo pipefail

required=(DATABASE_URL BOOTSTRAP_TENANT_ID BOOTSTRAP_TENANT_SLUG BOOTSTRAP_MEMBER_ID BOOTSTRAP_AUTH_USER_ID BOOTSTRAP_DISPLAY_NAME BOOTSTRAP_AUDIT_EVENT_ID)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "${name} is required" >&2
    exit 2
  fi
done

uuidv7_re='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
for name in BOOTSTRAP_TENANT_ID BOOTSTRAP_MEMBER_ID BOOTSTRAP_AUDIT_EVENT_ID; do
  if [[ ! "${!name}" =~ ${uuidv7_re} ]]; then
    echo "${name} must be a UUIDv7" >&2
    exit 3
  fi
done

psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 \
  -v tenant_id="${BOOTSTRAP_TENANT_ID}" \
  -v tenant_slug="${BOOTSTRAP_TENANT_SLUG}" \
  -v member_id="${BOOTSTRAP_MEMBER_ID}" \
  -v auth_user_id="${BOOTSTRAP_AUTH_USER_ID}" \
  -v display_name="${BOOTSTRAP_DISPLAY_NAME}" \
  -v audit_event_id="${BOOTSTRAP_AUDIT_EVENT_ID}" <<'SQL'
BEGIN;

SELECT set_config('bootstrap.tenant_id', :'tenant_id', false);
SELECT set_config('bootstrap.tenant_slug', :'tenant_slug', false);
SELECT set_config('bootstrap.member_id', :'member_id', false);
SELECT set_config('bootstrap.auth_user_id', :'auth_user_id', false);
SELECT set_config('bootstrap.display_name', :'display_name', false);
SELECT set_config('bootstrap.audit_event_id', :'audit_event_id', false);

DO $bootstrap$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth."user"
    WHERE id = current_setting('bootstrap.auth_user_id')
      AND "twoFactorEnabled" IS TRUE
  ) THEN
    RAISE EXCEPTION 'bootstrap user must exist in Better Auth and have two-factor enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth."twoFactor"
    WHERE "userId" = current_setting('bootstrap.auth_user_id')
      AND verified IS TRUE
  ) THEN
    RAISE EXCEPTION 'bootstrap user must have a verified TOTP enrollment';
  END IF;

  IF EXISTS (
    SELECT 1 FROM tenants
    WHERE (id = current_setting('bootstrap.tenant_id')::uuid OR slug = current_setting('bootstrap.tenant_slug'))
      AND NOT (
        id = current_setting('bootstrap.tenant_id')::uuid
        AND slug = current_setting('bootstrap.tenant_slug')
      )
  ) THEN
    RAISE EXCEPTION 'tenant bootstrap identity conflicts with existing tenant';
  END IF;

  INSERT INTO tenants (id, slug)
  VALUES (current_setting('bootstrap.tenant_id')::uuid, current_setting('bootstrap.tenant_slug'))
  ON CONFLICT DO NOTHING;

  IF EXISTS (
    SELECT 1 FROM members
    WHERE tenant_id = current_setting('bootstrap.tenant_id')::uuid
      AND (id = current_setting('bootstrap.member_id')::uuid OR auth_user_id = current_setting('bootstrap.auth_user_id'))
      AND NOT (
        id = current_setting('bootstrap.member_id')::uuid
        AND auth_user_id = current_setting('bootstrap.auth_user_id')
      )
  ) THEN
    RAISE EXCEPTION 'member bootstrap identity conflicts with existing member';
  END IF;

  INSERT INTO members (id, tenant_id, auth_user_id, display_name)
  VALUES (
    current_setting('bootstrap.member_id')::uuid,
    current_setting('bootstrap.tenant_id')::uuid,
    current_setting('bootstrap.auth_user_id'),
    current_setting('bootstrap.display_name')
  )
  ON CONFLICT DO NOTHING;
END
$bootstrap$;

WITH granted AS (
  INSERT INTO member_roles (tenant_id, member_id, role)
  VALUES (
    current_setting('bootstrap.tenant_id')::uuid,
    current_setting('bootstrap.member_id')::uuid,
    'PLATFORM_ADMIN'::member_role
  )
  ON CONFLICT DO NOTHING
  RETURNING 1
)
INSERT INTO audit_events (
  id, tenant_id, actor_type, actor_id, action, resource_type, resource_id, metadata, occurred_at
)
SELECT
  current_setting('bootstrap.audit_event_id')::uuid,
  current_setting('bootstrap.tenant_id')::uuid,
  'SYSTEM',
  'release-bootstrap',
  'bootstrap.platform_admin.granted',
  'member',
  current_setting('bootstrap.member_id'),
  jsonb_build_object('auth_user_id', current_setting('bootstrap.auth_user_id'), 'tenant_slug', current_setting('bootstrap.tenant_slug')),
  now()
FROM granted;

COMMIT;

SELECT json_build_object(
  'tenant_id', :'tenant_id',
  'tenant_slug', :'tenant_slug',
  'member_id', :'member_id',
  'auth_user_id', :'auth_user_id',
  'role', 'PLATFORM_ADMIN',
  'status', 'ready'
) AS bootstrap_result;
SQL
