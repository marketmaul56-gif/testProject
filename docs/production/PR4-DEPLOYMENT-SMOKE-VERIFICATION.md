# PR.4 — Production Deployment & Smoke Verification

Status: **BUILD COMPLETE — QUALITY GATE PENDING**

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

## Revision

Build incorporates CR-01 through CR-06. No Product, Domain, AI, Data, Security, or Authority decision from M0–M12 is changed.

## Functional / Quality Gate

PR.4 may LOCK only when, on one final candidate SHA:

1. PR.4 Deployment Rehearsal Gate — PASS.
2. API liveness/readiness — PASS.
3. Web smoke — PASS.
4. Worker process smoke — PASS.
5. Verifier Dispatcher trusted boundary smoke — PASS.
6. PostgreSQL migration — PASS.
7. Redis transport dependency — PASS.
8. S3-compatible storage runtime — PASS.
9. Canonical competence-chain E2E — PASS.
10. Rollback checkpoint restore — PASS.
11. Existing M12/PR.3 release regressions remain green.

## Explicitly Deferred / Not Claimed

PR.4 does not claim a public domain, TLS endpoint, AWS resource, registry promotion, production database mutation, production traffic, real production secrets, or live gVisor verifier node. Those require a real authorized environment and remain DEFERRED.

## Final Review

Pending executable evidence.

## LOCK

**NOT YET LOCKED.**
