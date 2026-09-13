# PR.3 — Release Artifact & Data Preparation

Status: **🔒 LOCKED — PROVIDER-NEUTRAL RELEASE PREPARATION BASELINE**

Parent baseline: **M0–M12 🔒 LOCKED; PR.1 🔒 LOCKED; PR.2 🔒 LOCKED (IaC baseline only; live AWS execution DEFERRED)**

PR.3 prepares a provider-neutral, reviewable and restorable release package without contacting or provisioning AWS. It does not deploy production infrastructure, push images to a live registry, mutate a production database, or claim a live production backup.

## Product / Release Purpose

A release candidate must bind an exact source commit to the executable service images, canonical migration set, Prisma schema and package lock, runtime configuration contract, guarded first-platform-admin bootstrap path, and a tamper-evident release fingerprint.

This milestone preserves traceability from the locked implementation baseline to artifacts that can later be promoted to an authorized production target without changing product or competence-authority semantics.

## Build

PR.3 implements:

1. `scripts/generate-release-manifest.mjs`
   - records the full source SHA;
   - records exact Docker image IDs for API, Web, Worker and Verifier Dispatcher;
   - hashes every Dockerfile, migration, Prisma schema, pnpm lockfile, runtime contract and packaged bundle;
   - computes one release fingerprint;
   - records live provider execution fields as `DEFERRED`.

2. `scripts/verify-release-manifest.mjs`
   - re-hashes all release inputs;
   - verifies Docker image identity when images are locally available;
   - validates migration set/count/bundle hashes;
   - rejects fingerprint drift;
   - rejects accidental conversion of deferred live execution to PASS.

3. `infrastructure/deployment/production-runtime-contract.json`
   - provider-neutral required environment-variable contract per service;
   - sensitive variable names only, never secret values;
   - preserves PostgreSQL authority, Redis transport-only semantics, optional/formative AI and verifier credential isolation.

4. `scripts/bootstrap-platform-admin.sh`
   - never creates an authentication password, TOTP secret, backup code or session;
   - requires an existing Better Auth user;
   - requires `twoFactorEnabled=true` and a verified Better Auth `twoFactor` record before granting `PLATFORM_ADMIN`;
   - creates/validates tenant and member binding idempotently;
   - grants application authorization state only;
   - emits one append-only audit event when the role is first granted;
   - requires operator-supplied UUIDv7 aggregate/audit identifiers.

5. `.github/workflows/pr3-release-package.yml`
   - checks out the exact release source SHA, including PR head SHA rather than GitHub's synthetic PR merge SHA;
   - asserts `git rev-parse HEAD == RELEASE_SOURCE_SHA`;
   - applies canonical migrations to PostgreSQL 18;
   - tests privileged bootstrap/TOTP/idempotency;
   - builds all four service images;
   - creates a compressed image bundle and deterministic migration bundle;
   - generates and verifies the release manifest;
   - deletes/reloads images from the package and proves identity does not drift;
   - replays the packaged migrations into a clean database;
   - scans the runtime contract for accidental credential values;
   - uploads a short-retention provider-neutral CI release package.

## Critical Review

### CR-01 — A git tag alone is insufficient release evidence

Resolution: manifest records exact image IDs, source/Dockerfile hashes and one release fingerprint.

### CR-02 — Release metadata must not leak secrets

Resolution: runtime contract contains names/invariants only and manifest contains hashes/IDs only. No production credential value is packaged.

### CR-03 — Migration packaging must remain canonical

Resolution: all version-controlled `prisma/migrations/*/migration.sql` files are discovered in lexical order, individually hashed, covered by a migration-set hash, packaged, then replayed against clean PostgreSQL 18.

### CR-04 — First admin bootstrap must not bypass authentication security

Resolution: bootstrap can bind only an existing Better Auth identity with enabled and verified TOTP. It cannot create authentication credentials.

### CR-05 — Bootstrap must not invent competence authority

Resolution: `PLATFORM_ADMIN` is authorization state only and remains non-authoritative for skill evidence and competency. The canonical chain remains:

`Artifact → Submission → Authoritative Verification → Skill Evidence → Deterministic Competency Projection → Measurable Competence View`.

### CR-06 — Retry must be safe

Resolution: tenant/member identity conflicts are rejected; role insertion is idempotent; audit record is emitted only on first role grant; manifest verification is read-only.

### CR-07 — Skipping AWS must not silently become PASS

Resolution: registry promotion, production migration apply, live tenant/admin bootstrap and live backup checkpoint remain hard-coded and verified as `DEFERRED`.

### CR-08 — A package must be restorable, not merely creatable

Resolution: CI deletes local image tags, restores them from the package and re-checks exact image identity. Migration bundle is also replayed from the package.

### CR-09 — GitHub PR `GITHUB_SHA` is not the source head SHA

During Final Review, the first PR package exposed a traceability defect: GitHub Actions used a synthetic PR merge SHA for `GITHUB_SHA`, while the actual branch head was different. This could make a manifest claim a source identity that did not exactly match the checked-out release source.

Resolution:

- `RELEASE_SOURCE_SHA` uses `github.event.pull_request.head.sha` for pull requests and `github.sha` otherwise;
- checkout is explicitly pinned to that SHA;
- CI asserts checked-out `HEAD` equals `RELEASE_SOURCE_SHA`;
- image tags, deterministic bundle timestamp, manifest source and artifact name all use the same source SHA.

Verified on corrected head `a76aac3e9599243ba872c1f739eaa819d3973196`; the exact-source-binding assertion passed.

### CR-10 — CI release package is evidence, not a durable production registry

The packaged image bundle is approximately 684 MB and intentionally uses short GitHub Actions retention. Resolution: treat it as reproducibility/recovery evidence for PR.3, not as registry promotion. Durable production registry publication remains a deferred deployment-execution concern.

## Revision

All CR-01 through CR-10 are incorporated. No M0–M12 Change Review is required. The AWS/live-production execution deferral is inherited from the accepted PR.2 change review and remains explicitly separate from this artifact-preparation lock.

## Functional / Quality Gate

Corrected candidate SHA: `a76aac3e9599243ba872c1f739eaa819d3973196`.

All required gates PASS:

1. PR.3 Release Package Gate — PASS, run `34733517915`.
2. Exact source-head binding assertion — PASS.
3. Release manifest generation + self-verification — PASS.
4. Four service images build — PASS.
5. Image bundle restore preserves exact image IDs — PASS.
6. Canonical migration set applies to PostgreSQL 18 — PASS.
7. Packaged migration bundle replays into clean PostgreSQL 18 — PASS.
8. Guarded platform-admin bootstrap with verified TOTP — PASS.
9. Bootstrap retry creates no duplicate role/audit grant — PASS.
10. Bootstrap without verified TOTP is denied — PASS.
11. Runtime contract secret-value scan — PASS.
12. M12 CI — PASS, run `34733517931`.
13. M12 OCI Artifact Smoke — PASS, run `34733517916`.
14. M12 Object Storage Integration — PASS, run `34733517918`.
15. M12 Redis Authority Transport — PASS, run `34733517923`.
16. M12 Recovery Drill — PASS, run `34733517922`.
17. M12 gVisor Hostile Rehearsal — PASS, run `34733517913`.
18. Bootstrap Integrity — PASS, run `34733517937`.

Corrected release-package artifact evidence:

- artifact ID: `10309584633`;
- artifact name: `pr3-release-package-a76aac3e9599243ba872c1f739eaa819d3973196`;
- artifact digest: `sha256:3e49e792fe4a79e26f8d127becb9af2e46f3cbca0736468d9adf65346463caa3`;
- artifact size: `683965555` bytes;
- retention: 3 days by workflow policy.

## Explicitly Deferred / Not Claimed

Because live AWS execution is intentionally skipped, PR.3 does **not** claim:

- ECR or any live-registry image push;
- registry `repo@sha256` promotion;
- production database migration execution;
- production tenant/member/admin creation;
- production secret injection;
- production backup snapshot/checkpoint;
- any live AWS resource state.

These are deployment-execution evidence and may be performed later without changing this locked artifact/data-preparation contract unless their implementation requires a material baseline change.

## Final Review

### Product / Authority

**PASS.** No completion, AI, instructor or admin path was promoted to competence authority. Release/bootstrap tooling does not create evidence or competency.

### Architecture / Data

**PASS.** PostgreSQL remains canonical; Redis remains transport-only; canonical migrations are packaged and replay-tested; no second source of truth is introduced.

### Security

**PASS.** Release metadata contains no credential values; privileged bootstrap requires verified TOTP; no password/TOTP/session generation exists; verifier credential isolation contract is preserved.

### Release Engineering

**PASS.** Exact source SHA, four images, migration set, runtime contract and bundles are bound by checksums/fingerprint and proven restorable. The synthetic PR-SHA defect found during review was corrected and reverified.

### Deferred Environment Execution

**ACCEPTED / EXPLICIT.** Live AWS/registry/database/backup execution remains DEFERRED by project-owner decision and is not represented as PASS.

Final decision: **PASS — PR.3 provider-neutral release artifact & data preparation is complete.**

## LOCK

**PR.3 — Release Artifact & Data Preparation 🔒 LOCKED.**

Locked scope is the provider-neutral release preparation contract and its reproducibility/security gates. Any future change to manifest semantics, privileged bootstrap security, migration packaging, source-to-artifact traceability, or competence-authority boundaries requires Change Review.
