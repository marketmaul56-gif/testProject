#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-prisma/migrations}"

if [[ ! -d "${MIGRATIONS_DIR}" ]]; then
  echo "migration directory not found: ${MIGRATIONS_DIR}" >&2
  exit 2
fi

mapfile -t migrations < <(find "${MIGRATIONS_DIR}" -mindepth 2 -maxdepth 2 -name migration.sql -print | sort)
if [[ ${#migrations[@]} -eq 0 ]]; then
  echo "no version-controlled migrations found in ${MIGRATIONS_DIR}" >&2
  exit 3
fi

for migration in "${migrations[@]}"; do
  echo "Applying ${migration}"
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${migration}"
done
