# M12 Requirement Traceability

Status values: `IMPLEMENTED`, `PARTIAL`, `NOT_IMPLEMENTED`, `NON_COMPLIANT`, `BLOCKED`.

Audit basis:
- `docs/locked/M3-technology-foundation.md`
- `docs/locked/M4-engineering-foundation.md`
- `docs/locked/M12-implementation-release-contract.md`
- current repository tree on branch `m12/implementation-foundation`
- successful M12 CI runs recorded below

The original M12.1 audit began from an empty/bootstrap repository. The repository has since progressed through implementation milestones M12.2–M12.7. This document is the current implementation trace, not the historical pre-implementation snapshot.

| ID | Capability | Locked source | Implementation evidence | Test evidence / remaining gate | Release gate | Status |
|---|---|---|---|---|---|---|
| M12-001 | Tenant/user boundary | M3.3/M3.5/M12 | `packages/platform/auth`, tenant-scoped PostgreSQL constraints, API principal middleware | security + PostgreSQL integration regression | Security | IMPLEMENTED |
| M12-002 | Immutable published learning versions | M12 + locked learning contracts | `prisma/migrations/202609120001_initial_core`, learning persistence guards | domain + migration regression | Domain/Data | IMPLEMENTED |
| M12-003 | Practice + immutable practice revision | M5/M12 | practice domain/persistence + submission schema | domain + authority integration | Core MVP | IMPLEMENTED |
| M12-004 | Project artifact revisions | M8/M12 | project artifact/revision persistence + seal immutability | domain + authority integration | Authority | IMPLEMENTED |
| M12-005 | Submission | M5/M8/M12 | practice/project submission persistence and server-controlled identity | security + authority integration | Authority | IMPLEMENTED |
| M12-006 | Authoritative verification | M3.7/M7/M12.6 | `packages/modules/verification`, `apps/verifier-dispatcher`, authority migration | authority integration PASS; live hostile-workload gVisor execution remains M12.8/M12.9 | Authority | IMPLEMENTED |
| M12-007 | Skill evidence | M7/M12.6 | `packages/modules/competency`, evidence provenance trigger, passed-verification outbox path | canonical authority integration | Authority | IMPLEMENTED |
| M12-008 | Deterministic competency projection | M9/M12.6 | deterministic evidence-derived projector + DB integrity guard | authority integration + rebuild regression | Authority | IMPLEMENTED |
| M12-009 | Cohort lifecycle | M10/M12.7 | `packages/modules/cohorts`, `202609120007_cohort_operations_completion` | cohort PostgreSQL integration | Operations | IMPLEMENTED |
| M12-010 | Membership lifecycle | M10/M12.7 | historical ENROLLED→REMOVED guard + one-active index + idempotent operations | duplicate/remove/re-enroll/cross-tenant integration | Operations | IMPLEMENTED |
| M12-011 | Learning assignment | M10/M12.7 | one primary published assignment, DRAFT-only mutation, lock after ACTIVE | activation/assignment integration | Operations | IMPLEMENTED |
| M12-012 | Instructor scoped access | M3.5/M10/M11/M12 | policy layer + cohort relationship checks + formative guidance | negative authorization + instructor experience integration | Authorization | IMPLEMENTED |
| M12-013 | AI coaching formative-only boundary | M3.8/M6/M11/M12.5 | `packages/modules/ai-coaching`, OpenAI Responses adapter, learner-only API | AI contract regression, outage degradation, authority policy | AI/Security | IMPLEMENTED |
| M12-014 | Cross-tenant isolation | M3.5/M11/M12.3 | server policy + composite same-tenant FKs | negative authorization + DB cross-tenant regression | Security | IMPLEMENTED |
| M12-015 | Object-level authorization | M3.5/M11/M12.3 | server-side authorization relationship checks | negative authorization regression | Security | IMPLEMENTED |
| M12-016 | Retry/idempotency on implemented authoritative/operational paths | M3.6/M7/M10/M11/M12 | verification request key, evidence uniqueness/outbox handling, cohort enrollment idempotency | authority + cohort integration | Reliability | IMPLEMENTED |
| M12-017 | System failure != learner FAIL | M7/M11/M12 | verification ERROR semantics + learner view mapping | domain, authority and experience regression | Authority/Reliability | IMPLEMENTED |
| M12-018 | Hidden verifier/runtime protection | M3.7/M7/M11/M12 | runsc sandbox contract: pinned digest, non-root, read-only root, no network, resource/output/time limits, minimal env, cleanup | contract tests implemented; live hostile-workload/gVisor node matrix remains M12.8/M12.9 | Security | PARTIAL |
| M12-019 | Migration/rollback | M4.5/M11/M12.9 | version-controlled PostgreSQL migrations through M12.7 | fresh migration PASS; production-like migration rehearsal + rollback/recovery remains | Release | PARTIAL |
| M12-020 | Backup/restore | M3.9/M11/M12.9 | not yet executed | backup/restore drill required | Release | NOT_IMPLEMENTED |
| M12-021 | Repository/workspace contract | M3.2/M4.1 | workspace, apps/packages/prisma/docs, architecture checks | architecture CI PASS | Engineering | IMPLEMENTED |
| M12-022 | CI quality pipeline | M4.6/M4.8/M12.8 | architecture/type/security/contracts/build/migration/experience/authority/cohort jobs | M12.8 still expands failure/performance/security execution | Testing | PARTIAL |
| M12-023 | Structured logging/telemetry baseline | M3.9/M4.9 | security audit + AI telemetry baseline | production observability/alert validation remains M12.9 | Observability | PARTIAL |
| M12-024 | Production configuration + secret boundaries | M3.9/M4.3/M12.9 | validated runtime config, Better Auth secret boundary, AI key optional/server-side | production configuration and secret deployment validation remains | Deployment | PARTIAL |
| M12-025 | Learner canonical E2E | M12 mandatory E2E | learner UX/read-model integration exists | full assignment→learning→practice/project→verification→evidence→competency E2E remains M12.8 | Release | PARTIAL |
| M12-026 | Instructor canonical E2E | M10/M12 mandatory E2E | cohort/roster/drill-down/evidence-backed reads/formative guidance integrated | full browser/API E2E remains M12.8 | Release | PARTIAL |
| M12-027 | Authority regression suite | M12 mandatory regression | domain/security/authority integration suites | expand to complete adversarial matrix in M12.8 | Release | PARTIAL |
| M12-028 | Security regression suite | M11/M12 | negative authorization/input/security tests + tenant DB constraints | verifier hostile-runtime and broader release security execution remains | Release | PARTIAL |
| M12-029 | Performance baseline | M11/M12.8 | not yet measured in M12 | measure/profile/retest required | Release | NOT_IMPLEMENTED |
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

Live hostile-workload execution on a dedicated gVisor node remains an M12.8/M12.9 environment gate and is not claimed as completed here.

### M12.7 — Cohort & Learning Operations Implementation Completion — 🔒 LOCKED

Implemented:
- cohort lifecycle `DRAFT → ACTIVE → COMPLETED → ARCHIVED` and `DRAFT → ARCHIVED`, with no backward transition;
- optimistic `version` concurrency checks;
- activation requires exactly one primary published immutable learning version;
- assignment mutation is allowed only in DRAFT and locked after activation;
- one active enrollment per learner/cohort;
- `ENROLLED → REMOVED` is historical and one-way;
- duplicate active enrollment is idempotent;
- re-enrollment creates a new membership occurrence;
- cohort/member/assignment/instructor records close same-tenant FK gaps;
- cohort completion has no evidence or competency side effect;
- instructor authority remains formative/read-scoped and cannot enter the competence authority chain.

Quality evidence: M12 CI run `34697852158` — six jobs PASS: domain/architecture/security, production web build, fresh migrations + constraint verification, learner/instructor experience integration, canonical authority integration, and cohort operations integration.

## Current release status

M12.1–M12.7 implementation milestones are complete through the scoped gates above. M12 overall remains **UNLOCKED** because M12.8–M12.10 still require execution evidence for the complete E2E/failure/security/performance matrix, production-like migration/rollback/backup-restore/deployment rehearsal, release candidate, and final production release gate.

No M12.5–M12.7 release blocker remains open at their milestone boundaries.
