#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"

mkdir -p "$(dirname "${BACKUP_FILE}")"

# Custom format supports integrity-aware restore and keeps credentials out of argv beyond DATABASE_URL usage.
pg_dump "${DATABASE_URL}" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-acl \
  --file="${BACKUP_FILE}"

if [[ ! -s "${BACKUP_FILE}" ]]; then
  echo "backup file is empty" >&2
  exit 4
fi

sha256sum "${BACKUP_FILE}" > "${BACKUP_FILE}.sha256"
echo "backup_created=${BACKUP_FILE}"
