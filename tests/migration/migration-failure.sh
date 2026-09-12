#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

root="$(mktemp -d)"
trap 'rm -rf "${root}"' EXIT
mkdir -p "${root}/001_valid" "${root}/002_invalid" "${root}/003_must_not_run"

cat > "${root}/001_valid/migration.sql" <<'SQL'
CREATE TABLE m12_migration_probe_first (id integer PRIMARY KEY);
SQL

cat > "${root}/002_invalid/migration.sql" <<'SQL'
THIS IS INTENTIONALLY INVALID SQL;
SQL

cat > "${root}/003_must_not_run/migration.sql" <<'SQL'
CREATE TABLE m12_migration_probe_after_failure (id integer PRIMARY KEY);
SQL

if MIGRATIONS_DIR="${root}" bash scripts/apply-migrations.sh; then
  echo "expected migration runner to fail on invalid migration" >&2
  exit 1
fi

first_exists="$(psql "${DATABASE_URL}" -Atc "SELECT to_regclass('public.m12_migration_probe_first') IS NOT NULL")"
after_exists="$(psql "${DATABASE_URL}" -Atc "SELECT to_regclass('public.m12_migration_probe_after_failure') IS NOT NULL")"

if [[ "${first_exists}" != "t" ]]; then
  echo "first migration should have committed before the injected failure" >&2
  exit 1
fi
if [[ "${after_exists}" != "f" ]]; then
  echo "migration runner continued after a failed migration" >&2
  exit 1
fi

echo "migration failure correctly stopped subsequent migrations"
