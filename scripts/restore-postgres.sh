#!/usr/bin/env bash
set -euo pipefail

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${ALLOW_DATABASE_RESTORE:?ALLOW_DATABASE_RESTORE must be explicitly set to YES}"

if [[ "${ALLOW_DATABASE_RESTORE}" != "YES" ]]; then
  echo "restore refused: set ALLOW_DATABASE_RESTORE=YES for an intentional restore" >&2
  exit 2
fi

if [[ ! -f "${BACKUP_FILE}" || ! -f "${BACKUP_FILE}.sha256" ]]; then
  echo "backup or checksum file missing" >&2
  exit 3
fi

sha256sum --check "${BACKUP_FILE}.sha256"

# Restore target must be provisioned explicitly by operations. This script does not create/drop databases.
pg_restore \
  --dbname="${RESTORE_DATABASE_URL}" \
  --no-owner \
  --no-acl \
  --exit-on-error \
  "${BACKUP_FILE}"

echo "restore_completed"
