# PR.3 — Release Artifact & Data Preparation

Status: **BUILD COMPLETE — QUALITY GATE PENDING**

Parent baseline: **M0–M12 🔒 LOCKED; PR.1 🔒 LOCKED; PR.2 🔒 LOCKED (IaC baseline only; live AWS execution DEFERRED)**

Branch: `production/pr3-release-artifacts`

PR.3 prepares a provider-neutral, reviewable release package without contacting or provisioning AWS. It does not deploy production infrastructure, push images to a live registry, mutate a production database, or claim a live production backup.

## Product / Release Purpose

A release candidate must be more than source code. It must bind the exact source commit to:

- the four executable service images;
- the canonical ordered migration set;
- the Prisma schema and package lock;
- the production runtime configuration contract;
- a guarded first-platform-admin bootstrap path;
- a tamper-evident release fingerprint.

This preserves traceability from the locked implementation baseline to the exact artifacts that can later be promoted to any authorized production target.

## Build

PR.3 adds:

1. `scripts/generate-release-manifest.mjs`
   - records full source SHA;
   - records exact Docker image IDs for API, Web, Worker, and Verifier Dispatcher;
   - hashes every Dockerfile, migration, Prisma schema, pnpm lockfile, runtime contract, and packaged bundle;
   - computes one release fingerprint;
   - explicitly records all live provider execution fields as `DEFERRED`.

2. `scripts/verify-release-manifest.mjs`
   - re-hashes release inputs;
   - checks Docker image identity when images are available locally;
   - validates the complete migration set and bundle hashes;
   - rejects a modified release fingerprint;
   - rejects accidental claims that live provider execution has passed.

3. `infrastructure/deployment/production-runtime-contract.json`
   - provider-neutral required environment-variable contract per service;
   - sensitive variable names only, never secret values;
   - preserves PostgreSQL authority, Redis transport-only semantics, optional/formative AI, and verifier credential isolation.

4. `scripts/bootstrap-platform-admin.sh`
   - never creates an authentication password or TOTP secret;
   - requires an already-existing Better Auth user;
   - verifies `twoFactorEnabled=true` and a verified Better Auth `twoFactor` record before granting `PLATFORM_ADMIN`;
   - creates/validates tenant and member binding idempotently;
   - grants only application-owned authorization state;
   - writes one append-only audit event when the role is first granted;
   - requires operator-supplied UUIDv7 aggregate/audit identifiers.

5. `.github/workflows/pr3-release-package.yml`
   - applies canonical migrations to PostgreSQL 18;
   - proves the privileged bootstrap rejects users without verified TOTP and remains idempotent on retry;
   - builds all four service images from the locked Dockerfiles;
   - creates a compressed image bundle and deterministic migration bundle;
   - generates and verifies the release manifest;
   - deletes/reloads the images from the package and proves image identity does not drift;
   - replays the packaged migration bundle into a clean database;
   - validates the production runtime contract contains names/rules only, not credential values;
   - uploads the provider-neutral release package as a short-retention GitHub Actions artifact.

## Critical Review

### CR-01 — A git SHA tag alone is not sufficient release evidence

A tag names a build but does not prove which local image bytes were produced. Resolution: the release manifest records the exact Docker image ID for each component plus source/Dockerfile hashes and a release fingerprint.

### CR-02 — Release metadata must not leak secrets

Resolution: the runtime contract contains environment-variable names and invariants only. The manifest contains hashes/IDs only. No database password, auth secret, Redis credential, object-storage secret, OpenAI key, or dispatcher token is packaged.

### CR-03 — Migration packaging must remain canonical

Resolution: migrations are discovered from the version-controlled `prisma/migrations/*/migration.sql` set in lexical order, each file is hashed, the complete set receives its own hash, and the packaged bundle is replayed against a fresh PostgreSQL 18 database.

### CR-04 — First admin bootstrap must not bypass authentication security

Resolution: the bootstrap path can only bind an existing Better Auth identity. It refuses `PLATFORM_ADMIN` unless both Better Auth two-factor enablement and a verified TOTP record exist. It does not generate passwords, TOTP secrets, backup codes, or sessions.

### CR-05 — Bootstrap must not invent competence authority

Resolution: the bootstrap script grants an application authorization role only. `PLATFORM_ADMIN` remains non-authoritative for skill evidence and competency. The canonical competence chain is unchanged.

### CR-06 — Retrying bootstrap/release preparation must be safe

Resolution: tenant/member bootstrap validates identity conflicts; role insertion is idempotent; the audit event is emitted only when the role is first granted. Release manifest verification is read-only.

### CR-07 — Skipping AWS must not silently convert live execution to PASS

Resolution: registry promotion, production migration apply, live tenant/admin bootstrap, and live backup checkpoint are hard-coded as `DEFERRED` in the manifest and are verified as such.

### CR-08 — A package must be restorable, not merely creatable

Resolution: CI removes the locally built image tags, restores them from the packaged image bundle, and re-verifies image identity. It also extracts and reapplies the packaged migration set to a clean database.

## Revision

The Build already incorporates CR-01 through CR-08. No Change Review to M0–M12 is required. The live AWS execution deferral is inherited from the accepted PR.2 change review and is not reinterpreted as successful deployment.

## Functional / Quality Gate

PR.3 may LOCK only when all of the following pass on the same final candidate SHA:

1. PR.3 Release Package Gate — PASS.
2. Release manifest generation + self-verification — PASS.
3. Four service images build successfully — PASS.
4. Image bundle restore preserves exact recorded image IDs — PASS.
5. Canonical migration set applies to PostgreSQL 18 — PASS.
6. Packaged migration bundle replays into a clean PostgreSQL 18 database — PASS.
7. Guarded platform-admin bootstrap succeeds only for verified TOTP identity — PASS.
8. Bootstrap retry creates no duplicate role/audit authority record — PASS.
9. Bootstrap without verified TOTP is denied — PASS.
10. Runtime contract secret-value scan — PASS.
11. Existing M12 regression workflows remain green — PASS.

## Explicitly Deferred / Not Claimed

Because the project owner elected to continue without involving AWS, PR.3 does **not** claim:

- ECR or any live-registry image push;
- registry `repo@sha256` digest promotion;
- production database migration execution;
- production tenant/member/admin creation;
- production secrets injection;
- production backup snapshot/checkpoint;
- any live AWS resource state.

These remain deployment-execution evidence and can be revisited later without changing the PR.3 artifact contract.

## Final Review

Pending executable gate evidence.

## LOCK

**NOT YET LOCKED.**
