# M12 Requirement Traceability

Status values: `IMPLEMENTED`, `PARTIAL`, `NOT_IMPLEMENTED`, `NON_COMPLIANT`, `BLOCKED`.

Audit basis:
- `docs/locked/M3-technology-foundation.md`
- `docs/locked/M4-engineering-foundation.md`
- `docs/locked/M12-implementation-release-contract.md`
- accepted `docs/release/CHANGE-REVIEW-M12.8-PERFORMANCE-BASELINE.md`
- current repository tree on branch `m12/implementation-foundation`
- successful M12 CI runs recorded below

The original M12.1 audit began from an empty/bootstrap repository. The repository has since progressed through implementation milestones M12.2–M12.8. This document is the current implementation trace, not the historical pre-implementation snapshot.

| ID | Capability | Locked source | Implementation evidence | Test evidence / remaining gate | Release gate | Status |
|---|---|---|---|---|---|---|
| M12-001 | Tenant/user boundary | M3.3/M3.5/M12 | `packages/platform/auth`, tenant-scoped PostgreSQL constraints, API principal middleware | security + PostgreSQL integration regression PASS | Security | IMPLEMENTED |
| M12-002 | Immutable published learning versions | M12 + locked learning contracts | `prisma/migrations/202609120001_initial_core`, learning persistence guards | domain + migration regression PASS | Domain/Data | IMPLEMENTED |
| M12-003 | Practice + immutable practice revision | M5/M12 | practice domain/persistence + submission schema | domain + authority integration PASS | Core MVP | IMPLEMENTED |
| M12-004 | Project artifact revisions | M8/M12 | project artifact/revision persistence + seal immutability | canonical authority + E2E PASS | Authority | IMPLEMENTED |
| M12-005 | Submission | M5/M8/M12 | practice/project submission persistence and server-controlled identity | duplicate/cross-tenant/authority regression PASS | Authority | IMPLEMENTED |
| M12-006 | Authoritative verification | M3.7/M7/M12.6 | `packages/modules/verification`, `apps/verifier-dispatcher`, authority migration | verifier outage/duplicate/canonical authority regression PASS; production-like runsc host rehearsal remains M12.9 | Authority | IMPLEMENTED |
| M12-007 | Skill evidence | M7/M12.6 | `packages/modules/competency`, evidence provenance trigger, passed-verification outbox path | canonical authority + failure recovery PASS | Authority | IMPLEMENTED |
| M12-008 | Deterministic competency projection | M9/M12.6 | deterministic evidence-derived projector + DB integrity guard | authority integration + E2E PASS | Authority | IMPLEMENTED |
| M12-009 | Cohort lifecycle | M10/M12.7 | `packages/modules/cohorts`, `202609120007_cohort_operations_completion` | cohort + canonical E2E PASS | Operations | IMPLEMENTED |
| M12-010 | Membership lifecycle | M10/M12.7 | historical ENROLLED→REMOVED guard + one-active index + idempotent operations | duplicate/remove/re-enroll/cross-tenant regression PASS | Operations | IMPLEMENTED |
| M12-011 | Learning assignment | M10/M12.7 | one primary published assignment, DRAFT-only mutation, lock after ACTIVE | activation/assignment + E2E PASS | Operations | IMPLEMENTED |
| M12-012 | Instructor scoped access | M3.5/M10/M11/M12 | policy layer + cohort relationship checks + formative guidance | negative authorization + instructor E2E PASS | Authorization | IMPLEMENTED |
| M12-013 | AI coaching formative-only boundary | M3.8/M6/M11/M12.5 | `packages/modules/ai-coaching`, OpenAI Responses adapter, learner-only API | AI contract + canonical AI-outage E2E PASS | AI/Security | IMPLEMENTED |
| M12-014 | Cross-tenant isolation | M3.5/M11/M12.3 | server policy + composite same-tenant FKs | negative authorization + DB cross-tenant failure matrix PASS | Security | IMPLEMENTED |
| M12-015 | Object-level authorization | M3.5/M11/M12.3 | server-side authorization relationship checks | negative authorization regression PASS | Security | IMPLEMENTED |
| M12-016 | Retry/idempotency on implemented authoritative/operational paths | M3.6/M7/M10/M11/M12 | verification request key, evidence uniqueness/outbox handling, cohort enrollment idempotency | authority + cohort + E2E retry regression PASS | Reliability | IMPLEMENTED |
| M12-017 | System failure != learner FAIL | M7/M11/M12 | verification ERROR semantics + learner view mapping | verifier outage, DB timeout, read-dependency failure regression PASS | Authority/Reliability | IMPLEMENTED |
| M12-018 | Hidden verifier/runtime protection | M3.7/M7/M11/M12 | runsc sandbox contract: pinned digest, non-root, read-only root, no network, resource/output/time limits, minimal env, cleanup | hidden-test/verifier contract PASS; actual production-like gVisor/runsc hostile-host rehearsal remains M12.9 | Security | PARTIAL |
| M12-019 | Migration/rollback | M4.5/M11/M12.9 | version-controlled PostgreSQL migrations + fail-fast migration runner | fresh migration PASS; injected migration failure fail-stop PASS; rollback/recovery rehearsal remains M12.9 | Release | PARTIAL |
| M12-020 | Backup/restore | M3.9/M11/M12.9 | not yet executed | backup/restore drill required | Release | NOT_IMPLEMENTED |
| M12-021 | Repository/workspace contract | M3.2/M4.1 | workspace, apps/packages/prisma/docs, architecture checks | architecture CI PASS | Engineering | IMPLEMENTED |
| M12-022 | CI quality pipeline | M4.6/M4.8/M12.8 | architecture/type/security/contracts/build/migration/experience/authority/cohort/E2E/failure/performance jobs | M12 CI run `34698980079` 9/9 PASS | Testing | IMPLEMENTED |
| M12-023 | Structured logging/telemetry baseline | M3.9/M4.9 | security audit + AI telemetry baseline | production observability/alert validation remains M12.9 | Observability | PARTIAL |
| M12-024 | Production configuration + secret boundaries | M3.9/M4.3/M12.9 | validated runtime config, Better Auth secret boundary, AI key optional/server-side | production configuration and secret deployment validation remains | Deployment | PARTIAL |
| M12-025 | Learner canonical E2E | M12 mandatory E2E | `tests/e2e/canonical-journey.test.ts` | assignment→lesson→AI outage→practice/project→verification→evidence→competency PASS | Release | IMPLEMENTED |
| M12-026 | Instructor canonical E2E | M10/M12 mandatory E2E | canonical E2E + experience read model/guidance | cohort→roster→evidence-backed view→formative guidance PASS | Release | IMPLEMENTED |
| M12-027 | Authority regression suite | M12 mandatory regression | domain/security/authority integration + canonical E2E | retry, outage, evidence failure, false evidence/competency, completion non-authority PASS | Release | IMPLEMENTED |
| M12-028 | Security regression suite | M11/M12 | negative authorization/input/security + tenant DB constraints + verifier contract | current CI scope PASS; production-like verifier host rehearsal remains M12.9 | Release | PARTIAL |
| M12-029 | Performance baseline | M11/M12.8 + accepted Change Review | `tests/performance/read-model-baseline.test.ts` asserts approved p95 targets on 50 learners / 20 lessons / 1,000 progress rows | run `34698980079`: learner p95 5.84 ms <= 100 ms; instructor p95 40.39 ms <= 200 ms | Release | IMPLEMENTED |
| M12-030 | Release candidate/deployment evidence | M12.9/M12.10 | not yet produced | RC, production-like smoke, migration/restore, readiness matrix required | Release | NOT_IMPLEMENTED |

## Locked implementation milestones

### M12.5 — AI Coaching Production Integration — 🔒 LOCKED

Implemented: context minimization, versioned formative policy, strict structured output validation, `store:false`, no tools, timeout/provider failure handling, learner-only server authorization, telemetry without learner content, graceful `UNAVAILABLE` result, and no evidence/verification/competency write authority.

Quality evidence: M12 CI run `34696685371` — architecture/type/domain/security/contracts/Prisma/build/migration/experience jobs PASS after revisions.

### M12.6 — Verification, Evidence & Competency Authority Completion — 🔒 LOCKED

Implemented canonical authority path:

`Submission → Verification Attempt → Authoritative Verification Result → PASSED-only Evidence → Deterministic Competency Projection`.

Key enforcement: tenant-scoped verification request idempotency, immutable/provenance verification results, project-skill authoritative alignment, evidence uniqueness/provenance, evidence-derived competency integrity, retry-safe outbox processing, system failure as `ERROR` rather than learner `FAILED`, and runsc sandbox contract. Prisma schema was explicitly synchronized with migration `202609120006_authority_completion` during Final Review.

Quality evidence: M12 CI run `34697650100` — all five jobs PASS, including canonical PostgreSQL authority integration and learner/instructor regression.

### M12.7 — Cohort & Learning Operations Implementation Completion — 🔒 LOCKED

Implemented cohort lifecycle, optimistic concurrency, one primary published assignment, assignment lock after ACTIVE, historical/idempotent membership semantics, same-tenant persistence boundaries, and non-authority cohort completion.

Quality evidence: M12 CI run `34697852158` — six jobs PASS.

### M12.8 — Integration, Security, Reliability & Performance Test Execution — 🔒 LOCKED

M12.8 release matrix executes architecture/type/domain/security/contracts, production web build, fresh PostgreSQL migration, learner/instructor integration, canonical authority integration, cohort operations, canonical learner/instructor E2E, AI outage, DB/read dependency failures, duplicate/stale/cross-tenant cases, migration fail-stop, and performance thresholds.

The missing historical M11 numeric performance values were resolved only through explicit Change Review; they were not fabricated. Approved replacement baseline:

- learner overview p95 <= 100 ms;
- instructor cohort overview p95 <= 200 ms;
- minimum dataset 50 learners / 20 lessons / 1,000 progress rows.

Final evidence: M12 CI run `34698980079` on commit `93650cbe2b9a8a2eea6573242456a999b27eff2e` — **9/9 jobs PASS**.

Post-approval performance evidence:

- learner overview: p50 4.15 ms, p95 5.84 ms, max 6.33 ms;
- instructor cohort overview: p50 28.24 ms, p95 40.39 ms, max 42.01 ms.

`RB-M12-008-001` is RESOLVED. Dedicated production-like runsc hostile-host rehearsal remains an M12.9 environment gate and is not incorrectly claimed by M12.8.

## Current release status

M12.1–M12.8 are 🔒 LOCKED.

M12.9 Release Candidate & Deployment Readiness may begin. Remaining release-critical work includes production configuration validation, verifier-host rehearsal, observability/alerts, migration rollback/recovery rehearsal, backup/restore drill, production-like smoke, and RC evidence.

M12 overall remains **UNLOCKED** until M12.9 and M12.10 pass their gates.
