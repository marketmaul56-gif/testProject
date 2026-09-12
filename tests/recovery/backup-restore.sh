#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"

workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT
backup_file="${workdir}/skill-platform.dump"

psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO tenants (id, slug)
VALUES ('00000000-0000-7000-8000-000000000901', 'backup-restore-sentinel');
SQL

BACKUP_FILE="${backup_file}" bash scripts/backup-postgres.sh

# Prove restored data is the backup snapshot, not a live copy made after the dump.
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO tenants (id, slug)
VALUES ('00000000-0000-7000-8000-000000000902', 'post-backup-sentinel');
SQL

ALLOW_DATABASE_RESTORE=YES BACKUP_FILE="${backup_file}" bash scripts/restore-postgres.sh

restored_pre_count="$(psql "${RESTORE_DATABASE_URL}" -Atqc "SELECT count(*) FROM tenants WHERE slug='backup-restore-sentinel'")"
restored_post_count="$(psql "${RESTORE_DATABASE_URL}" -Atqc "SELECT count(*) FROM tenants WHERE slug='post-backup-sentinel'")"

[[ "${restored_pre_count}" == "1" ]] || { echo "restore lost pre-backup sentinel" >&2; exit 10; }
[[ "${restored_post_count}" == "0" ]] || { echo "restore incorrectly included post-backup data" >&2; exit 11; }

# Backup must preserve critical integrity objects, not only table rows.
for trigger in \
  skill_evidence_requires_pass \
  verification_result_provenance_guard \
  competency_projection_integrity_guard \
  course_versions_immutable_after_publish \
  audit_events_append_only \
  cohorts_lifecycle_contract_guard; do
  found="$(psql "${RESTORE_DATABASE_URL}" -Atqc "SELECT count(*) FROM pg_trigger WHERE tgname='${trigger}'")"
  [[ "${found}" == "1" ]] || { echo "restored database missing trigger ${trigger}" >&2; exit 12; }
done

for relation in 'auth."user"' 'auth.session' 'auth."twoFactor"' public.skill_evidence public.competency_states; do
  found="$(psql "${RESTORE_DATABASE_URL}" -Atqc "SELECT to_regclass('${relation}') IS NOT NULL")"
  [[ "${found}" == "t" ]] || { echo "restored database missing relation ${relation}" >&2; exit 13; }
done

echo "backup_restore_drill=PASS"
