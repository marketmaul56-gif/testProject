# Production Operations Runbook — MVP

Status: M12.9 provider-neutral operational baseline. This document does not choose a cloud vendor or replace environment-specific deployment documentation.

## Release prerequisites

A production release is prohibited unless:

- M12 release gates are PASS and no release blocker remains;
- immutable OCI image digests for the promoted release are recorded;
- version-controlled migrations were rehearsed against a production-like PostgreSQL 18 target;
- backup/restore drill is PASS;
- production configuration validation is PASS;
- verifier host hostile-workload rehearsal is PASS;
- smoke checks are PASS;
- rollback/recovery owner and release operator are identified.

## Runtime health

- `GET /healthz` — process liveness only.
- `GET /readyz` — dependency-aware application/auth PostgreSQL readiness.
- A failed readiness probe must remove the API instance from serving traffic; it must not be converted into learner verification failure.

Do not expose credentials, connection strings, stack traces, learner artifacts, prompts, hidden tests, or verifier internals through health endpoints.

## Database migration procedure

1. Confirm a recent restorable backup exists.
2. Record the release commit/image digest and current schema state.
3. Apply only version-controlled migrations using `scripts/apply-migrations.sh`.
4. Fail immediately on the first migration error.
5. Verify authority/immutability/auth/audit constraints before shifting traffic.
6. Run canonical smoke checks.
7. For staged destructive changes, use expand → migrate → verify → contract. Do not assume a down migration is safe.

## Recovery / rollback

Application rollback and database recovery are separate decisions.

Application:

- promote the previously known-good immutable OCI digest;
- do not rebuild an old version from mutable source/dependencies during an incident.

Database:

- prefer forward repair when safe and data-preserving;
- when restore is required, provision an explicit restore target and use the last verified backup;
- `scripts/restore-postgres.sh` requires `ALLOW_DATABASE_RESTORE=YES` and verifies the backup checksum before restore;
- never run a destructive restore against an unspecified target.

After recovery, rerun authority constraints and canonical read/smoke checks before reopening traffic.

## Backup policy contract

M3 engineering targets:

- PostgreSQL RPO target: <= 15 minutes;
- PostgreSQL RTO target: <= 4 hours.

The selected managed PostgreSQL provider must be configured to meet those targets. Provider-specific schedule/PITR configuration must be captured in OpenTofu/environment documentation after a deployment target is approved.

A successful CI backup/restore drill proves logical dump/restore integrity; it does not by itself prove the production provider's RPO schedule.

## Verification runtime incident rules

Learner execution is hostile/untrusted. Production verifier nodes must use the locked gVisor/runsc boundary with no production credentials, disabled network by default, pinned image digest, non-root execution, read-only base runtime, ephemeral workspace, resource/output/time limits, and mandatory cleanup.

If verifier infrastructure is unavailable or unhealthy:

- return/record system `ERROR` semantics;
- do not record learner `FAILED`;
- do not issue evidence;
- keep the event retryable according to the authoritative workflow.

## AI provider incident rules

AI Coaching is optional/formative. Provider outage must degrade to `UNAVAILABLE` and never stop learning, submission, verification, evidence issuance, or competency projection.

## Logging and redaction

Structured operational logs may contain correlation ID, operation category, sanitized status/error class, latency, provider/model identifier, and non-sensitive resource identifiers when justified.

Never log passwords, tokens, session secrets, authorization headers, database credentials, raw learner artifacts, raw AI prompts/responses, hidden tests, verifier secrets, or sensitive personal data.

## Incident priority

Treat as release/incident P0:

- false evidence or false competence;
- evidence corruption/loss;
- cross-tenant exposure or IDOR;
- hidden verifier/test leakage;
- immutable revision corruption;
- system error represented as learner FAIL;
- restore failure when recovery is required;
- authority ambiguity;
- critical learner/instructor canonical flow unavailable.

## Release evidence to retain

For every RC/production promotion retain:

- source commit SHA;
- OCI image digests;
- CI/release gate run IDs;
- migration rehearsal result;
- backup/restore result;
- verifier-host rehearsal result;
- production-like smoke result;
- accepted debt, if any;
- operator/date and rollback reference.
