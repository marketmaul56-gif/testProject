# M12 Requirement Traceability

Status values: `IMPLEMENTED`, `PARTIAL`, `NOT_IMPLEMENTED`, `NON_COMPLIANT`, `BLOCKED`.

Audit basis:
- `docs/locked/M3-technology-foundation.md`
- `docs/locked/M4-engineering-foundation.md`
- `docs/locked/M12-implementation-release-contract.md`
- current repository tree on branch `m12/implementation-foundation`

## M12.1 actual implementation audit

The repository currently contains governance/recovery artifacts and bootstrap CI only. No application runtime, database schema, migrations, domain modules, API implementation, learner/instructor UI, queue consumers, verifier runtime, or production deployment code exists yet. Therefore runtime capabilities below are classified as `NOT_IMPLEMENTED`, not `BLOCKED`. The former M3/M4-baseline blocker is resolved.

| ID | Capability | Locked source | Planned implementation location | Planned test location | Release gate | Priority | Status |
|---|---|---|---|---|---|---|---|
| M12-001 | Tenant/user boundary | M3.3/M3.5/M12 | `packages/modules/identity`, `packages/platform/auth`, `apps/api` | `tests/integration/auth`, `tests/e2e/security` | Security | P0 | NOT_IMPLEMENTED |
| M12-002 | Immutable published learning versions | M12 + upstream locked learning contracts | `packages/modules/learning`, `prisma` | `tests/integration/learning` | Domain/Data | P0 | NOT_IMPLEMENTED |
| M12-003 | Practice + immutable practice revision | M5.2/M5.5 | `packages/modules/practice`, `prisma` | `tests/unit/practice`, `tests/integration/practice` | Core MVP | P1 | NOT_IMPLEMENTED |
| M12-004 | Project artifact revisions | M12 + M8 locked contract | `packages/modules/projects`, `prisma` | `tests/integration/projects` | Authority | P0 | NOT_IMPLEMENTED |
| M12-005 | Submission | M5/M12 | `packages/modules/practice`, `packages/modules/projects`, `prisma` | `tests/integration/submission` | Authority | P0 | NOT_IMPLEMENTED |
| M12-006 | Authoritative verification | M3.7/M5.6/M12.6 | `packages/modules/verification`, `apps/verifier-dispatcher` | `tests/contract/verification`, `tests/e2e/authority` | Authority | P0 | NOT_IMPLEMENTED |
| M12-007 | Skill evidence | M3.3/M5.7/M12.6 | `packages/modules/competency`, `prisma` | `tests/unit/competency`, `tests/integration/evidence` | Authority | P0 | NOT_IMPLEMENTED |
| M12-008 | Deterministic competency projection | M12.6 + locked competency contract | `packages/modules/competency` | `tests/unit/competency`, `tests/integration/competency` | Authority | P0 | NOT_IMPLEMENTED |
| M12-009 | Cohort lifecycle | M12.7 + M10 | `packages/modules/cohorts`, `prisma` | `tests/unit/cohorts`, `tests/integration/cohorts` | Operations | P1 | NOT_IMPLEMENTED |
| M12-010 | Membership lifecycle | M12.7 + M10 | `packages/modules/cohorts`, `prisma` | `tests/integration/cohorts` | Operations | P1 | NOT_IMPLEMENTED |
| M12-011 | Learning assignment | M12.7 + M10 | `packages/modules/cohorts`, `packages/modules/learning` public surface | `tests/integration/cohorts` | Operations | P1 | NOT_IMPLEMENTED |
| M12-012 | Instructor scoped access | M3.5/M10/M11/M12 | `packages/platform/auth`, module policy surfaces | `tests/integration/auth`, `tests/e2e/instructor` | Authorization | P0 | NOT_IMPLEMENTED |
| M12-013 | AI coaching formative-only boundary | M3.8/M6/M11/M12.5 | `packages/modules/ai-coaching` | `tests/contract/ai`, `tests/e2e/authority` | AI/Security | P0 | NOT_IMPLEMENTED |
| M12-014 | Cross-tenant isolation | M3.5/M11/M12.3 | application policy + repository query boundaries | `tests/integration/auth`, `tests/e2e/security` | Security | P0 | NOT_IMPLEMENTED |
| M12-015 | Object-level authorization | M3.5/M11/M12.3 | application policy module | `tests/integration/auth` | Security | P0 | NOT_IMPLEMENTED |
| M12-016 | Retry/idempotency | M3.6/M5/M7/M11/M12 | outbox consumers, verification/evidence writes | `tests/integration/retry`, `tests/e2e/authority` | Reliability | P0 | NOT_IMPLEMENTED |
| M12-017 | System failure != learner FAIL | M3.7/M5/M7/M11/M12 | verification result semantics | `tests/contract/verification`, `tests/e2e/failure` | Authority/Reliability | P0 | NOT_IMPLEMENTED |
| M12-018 | Hidden verifier protection | M3.7/M7/M11/M12 | verifier runtime + storage boundary | `tests/security/verifier` | Security | P0 | NOT_IMPLEMENTED |
| M12-019 | Migration/rollback | M4.5/M11/M12.9 | `prisma`, `infra`, operational docs | `tests/migration` | Release | P0 | NOT_IMPLEMENTED |
| M12-020 | Backup/restore | M3.9/M11/M12.9 | `infra`, operational runbooks | production-like drill | Release | P0 | NOT_IMPLEMENTED |
| M12-021 | Repository/workspace contract | M3.2/M4.1 | root workspace + apps/packages/prisma/infra/docs | CI architecture checks | Engineering | P1 | PARTIAL |
| M12-022 | CI quality pipeline | M4.6/M4.8/M12.8 | `.github/workflows` | workflow run | Testing | P1 | PARTIAL |
| M12-023 | Structured logging/telemetry baseline | M3.9/M4.9 | `packages/platform/observability` | integration/smoke | Observability | P2 | NOT_IMPLEMENTED |
| M12-024 | Production configuration + secret boundaries | M3.9/M4.3/M12.9 | `packages/platform/config`, `infra` | config validation/security | Deployment | P0 | NOT_IMPLEMENTED |
| M12-025 | Learner canonical E2E | M5/M12 mandatory E2E | `apps/web`, `apps/api`, domain modules | `tests/e2e/learner` | Release | P0 | NOT_IMPLEMENTED |
| M12-026 | Instructor canonical E2E | M10/M12 mandatory E2E | `apps/web`, `apps/api`, cohorts/competency | `tests/e2e/instructor` | Release | P0 | NOT_IMPLEMENTED |
| M12-027 | Authority regression suite | M12 mandatory regression | authority boundaries | `tests/e2e/authority` | Release | P0 | NOT_IMPLEMENTED |
| M12-028 | Security regression suite | M11/M12 | app + verifier boundaries | `tests/security` | Release | P0 | NOT_IMPLEMENTED |
| M12-029 | Performance baseline | M11/M12.8 | actual runtime | `tests/performance` | Release | P2 | NOT_IMPLEMENTED |
| M12-030 | Release candidate/deployment evidence | M12.9/M12.10 | CI/CD + production-like environment | smoke/E2E/migration/restore | Release | P0 | NOT_IMPLEMENTED |

## Release-blocker ordering

Implementation order is constrained by correctness risk:

1. P0 authority and data-integrity foundation: immutable revisions, submissions, verification result semantics, evidence uniqueness, competency projection.
2. P0 security: tenant/object authorization, hidden verifier boundary, production config/secret isolation.
3. P1 core learner and cohort/instructor flows.
4. P2 observability/performance polish only after correctness paths execute.

## M12.1 quality gate

- Repository inspected: PASS
- M3/M4 locked baseline recovered: PASS
- Actual implementation status classified: PASS
- P0/P1/P2 prioritization established: PASS
- Requirement → implementation location → test location → release gate traceability established: PASS

**M12.1 result: PASS — eligible to LOCK as an audit milestone. Runtime capabilities remain implementation work for M12.2–M12.10.**
