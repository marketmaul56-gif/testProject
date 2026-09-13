# PR.4 — Production Deployment & Smoke Verification

Status: **🔒 LOCKED — PROVIDER-NEUTRAL DEPLOYMENT REHEARSAL BASELINE**

Parent baseline: **M0–M12 🔒 LOCKED; PR.1 🔒 LOCKED; PR.2 🔒 LOCKED; PR.3 🔒 LOCKED**

Execution mode: **provider-neutral local/CI rehearsal; live AWS execution remains DEFERRED**.

## Purpose

PR.4 proves that the locked release inputs can be assembled into one production-like runtime topology and survive deployment smoke checks without changing competence authority. It deliberately separates **deployment rehearsal evidence** from **live production deployment evidence**.

## Build

The PR.4 gate provisions ephemeral PostgreSQL 18 and Redis, starts pinned S3-compatible object storage, applies canonical migrations, creates a rollback checkpoint, builds the four immutable service images, and starts API, Web, Worker and Verifier Dispatcher with production-mode configuration.

It verifies:

- API `/healthz` and `/readyz`;
- Web runtime availability;
- trusted Worker remains running;
- Verifier Dispatcher health and non-root application user;
- API/Worker/Dispatcher OCI images run as the expected `node` user;
- canonical competence-chain E2E regression;
- rollback checkpoint can restore the canonical schema into a clean database;
- no AWS credentials or live provider execution are required.

## Critical Review

### CR-01 — A container smoke test is not a live production deployment

Resolution: the workflow hard-asserts `LIVE_PROVIDER_EXECUTION=DEFERRED` and absence of AWS access-key environment variables. Documentation never labels the rehearsal as AWS deployment.

### CR-02 — Readiness alone does not prove the competence authority chain

Resolution: the canonical E2E suite is executed after the production-mode service topology starts. Existing authority invariants remain authoritative.

### CR-03 — Deployment verification needs a rollback checkpoint

Resolution: a PostgreSQL custom-format checkpoint is captured after canonical migrations and before application smoke traffic. It is restored into a clean database and the canonical schema footprint is compared.

### CR-04 — AI must not become a deployment dependency

Resolution: no OpenAI credential is supplied. The deterministic core deployment must become healthy without AI.

### CR-05 — Hostile-code isolation cannot be claimed from an ordinary container runner

Resolution: PR.4 only verifies the trusted Verifier Dispatcher process boundary here. Actual gVisor hostile rehearsal remains covered by the locked M12 gVisor workflow; live verifier-host execution inside AWS remains DEFERRED.

### CR-06 — Object storage must be part of the production-like topology

Resolution: a pinned MinIO release provides the S3-compatible runtime endpoint. Existing object-storage integration remains a separate regression gate.

### CR-07 — Rollback tooling must match the production database major version

The first executable gate failed because the Ubuntu runner installed PostgreSQL 16 client utilities while the rehearsal database is PostgreSQL 18. `pg_dump` correctly refused the server/client mismatch.

Resolution: rollback dump, restore, database creation and schema comparison now execute through the pinned `postgres:18` image. This keeps recovery tooling major-version aligned with the locked PostgreSQL 18 baseline.

## Revision

The final build incorporates CR-01 through CR-07. No Product, Domain, AI, Data, Security, or Authority decision from M0–M12 is changed.

## Functional / Quality Gate

Final executable candidate: `c7f3981c1db60d26d8533d1e68fc291ca007433b`.

PR.4 Deployment Rehearsal Gate run `34736467122` — **PASS**.

Verified in that run:

1. exact frozen dependency install — PASS;
2. provider execution remains deferred / no AWS access keys — PASS;
3. canonical PostgreSQL 18 migrations — PASS;
4. PostgreSQL 18 rollback checkpoint creation — PASS;
5. pinned S3-compatible object storage startup — PASS;
6. API/Web/Worker/Verifier Dispatcher image builds — PASS;
7. API liveness/readiness — PASS;
8. Web smoke — PASS;
9. Worker process/user smoke — PASS;
10. Verifier Dispatcher trusted boundary smoke — PASS;
11. canonical competence-chain E2E — PASS;
12. PostgreSQL 18 rollback checkpoint restore/schema comparison — PASS.

Bootstrap Integrity on the same branch revision remains part of the repository regression baseline. Full PR regression is required again on the final LOCK SHA before merge.

## Explicitly Deferred / Not Claimed

PR.4 does not claim a public domain, TLS endpoint, AWS resource, registry promotion, production database mutation, production traffic, real production secrets, or live gVisor verifier node. Those require a real authorized environment and remain DEFERRED.

## Final Review

### Product / Authority

**PASS.** The deployment rehearsal does not create a new competence path. Completion, AI, instructor and admin remain non-authoritative for competence.

### Architecture / Runtime

**PASS.** Web/API/Worker/Dispatcher, PostgreSQL, Redis and S3-compatible storage compose successfully in production mode. PostgreSQL remains canonical and Redis remains transport-only.

### Security

**PASS.** No AWS credential is consumed, trusted containers retain non-root application users, AI is not required for readiness, and hostile-code claims are not expanded beyond existing gVisor evidence.

### Reliability / Recovery

**PASS.** A PostgreSQL 18-compatible rollback checkpoint is captured and restored successfully. The version mismatch discovered by the first gate was corrected before LOCK.

### Environment truthfulness

**PASS.** This milestone proves deployment rehearsal only. Live cloud deployment and public traffic remain DEFERRED.

Final decision: **PASS — provider-neutral deployment & smoke verification baseline is complete.**

## LOCK

**PR.4 — Production Deployment & Smoke Verification 🔒 LOCKED.**

Locked scope is the provider-neutral deployment rehearsal contract, smoke sequence and rollback-checkpoint verification. Any future claim of actual production deployment still requires real environment evidence.
