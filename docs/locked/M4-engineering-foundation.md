# M4 — Implementation Foundation & Engineering Setup 🔒 LOCKED

**Recovery status:** Canonical recovery from the consolidated M0–M5 LOCKED context.
**Governance:** This file preserves final M4.1–M4.10 decisions. Any change requires explicit Change Review.

## CR-M4-001

The physical repository topology from M3 was unavailable in the active M4 context. M4 therefore locked a **logical workspace contract**, not a replacement repository strategy. If M3 uses a monorepo, the logical structure lives in one repository; otherwise the same boundaries/conventions apply across the relevant repositories. No M0–M3 decision changed.

## M4.1 — Repository & Workspace Bootstrap

Repository/workspace must be reproducible, dependency-locked, secret-safe, documented, ownership-oriented, and operable through one canonical developer workflow.

Canonical lifecycle:

```text
clone → setup → configure → migrate → seed → dev → test → build
```

Logical workspace contract:

```text
/
├── apps/
│   └── <runtime applications defined by M3>
├── packages/
│   ├── contracts/
│   ├── configuration/
│   ├── observability/
│   ├── testing/
│   └── <explicitly justified shared packages>
├── modules/
│   └── <domain modules according to M2/M3>
├── infrastructure/
│   ├── local/
│   ├── deployment/
│   └── migrations/
├── scripts/
├── tests/
│   ├── integration/
│   ├── contract/
│   └── e2e/
├── docs/
│   ├── architecture/
│   ├── engineering/
│   └── adr/
├── .env.example
├── <dependency lockfile>
└── README
```

Only folders required by the actual M3 stack should be created.

Canonical operations conceptually include: setup, dev, check, test, build, db:migrate, db:seed.

Repository rules:

- dependency lockfile mandatory;
- secrets never committed;
- runtime/tool versions follow M3;
- ADRs for important technical decisions;
- no feature/business implementation in bootstrap;
- no generic `common`/`utils` dumping ground;
- avoid new workspace frameworks unless justified by M3.

Branching: trunk-oriented development, protected main, short-lived branches, pull request review, no unnecessary long-lived integration branches.

## M4.2 — Codebase Structure & Module Boundaries

Core dependency direction:

```text
Interface / Delivery → Application → Domain
```

Infrastructure implements required ports/contracts.

Rules:

- domain does not depend on web/API framework;
- infrastructure does not leak into domain objects;
- cross-module dependencies explicit;
- circular dependencies prohibited;
- entrypoints compose/orchestrate rather than accumulate business rules;
- shared abstractions require clear responsibility and owner.

Cross-module interactions use justified application services, ports, contracts, query boundaries, or domain/integration events. Direct cross-module table coupling is prohibited unless explicitly LOCKED upstream.

## M4.3 — Environment & Configuration Foundation

Environment contract:

```text
local → test → staging → production
```

Rules:

- configuration explicit and validated;
- server-only and browser/public config separated;
- required config fails early at startup;
- production has no insecure fallback values;
- `.env.example` contains names/examples, never valid credentials;
- feature flags remain lightweight unless future requirements justify more;
- config accessed through controlled runtime boundaries.

## M4.4 — Local Development & Runtime Bootstrap

Local development approximates production contracts, not production scale.

- app processes may run natively for feedback speed;
- dependencies may run locally/containerized per M3;
- dependency health must be verifiable;
- development state recreatable;
- reset mechanisms guarded from staging/production;
- undocumented machine-specific requirements prohibited;
- real lightweight core dependencies preferred locally where practical;
- expensive/non-deterministic external systems may use test doubles.

## M4.5 — Database Migration, Seed & Test Data Foundation

Database evolution:

- version-controlled migrations;
- no normal manual production schema mutation;
- production runtime auto-sync prohibited;
- forward migrations default;
- destructive changes use expand/migrate/contract when needed;
- `down` migrations not assumed universally safe;
- recovery has explicit operational path.

Seed categories:

1. Reference seed — system-required data.
2. Development/demo seed — non-production data.

Demo seed must never run automatically in production.

Testing uses isolated DB/state. Factories/builders are preferred to giant static fixtures. Migration failures block release.

## M4.6 — Engineering Quality & Coding Standards

Canonical quality pipeline:

```text
format check → lint → static/type check → architecture checks → tests → build
```

Rules:

- CI is source of truth;
- local hooks optional accelerators;
- correctness-affecting warnings are not ignored globally;
- suppressions local and justified;
- generated/vendor code handled appropriately;
- ADRs capture important technical decisions;
- PRs maintain traceability to requirements/tasks/milestones.

Definition of Done includes implementation, tests, docs/contracts updates, migrations where relevant, and passing CI.

No arbitrary global test-coverage target is LOCKED. Depth is risk/behavior driven.

## M4.7 — Automated Testing Foundation

| Layer | Responsibility |
|---|---|
| Unit | Domain/application behavior |
| Integration | DB/persistence/infrastructure/framework |
| Contract | Module/service/provider boundaries |
| E2E | Critical journeys |
| Smoke | Deployment/runtime sanity |

AI testing:

- live provider is not default unit/integration CI dependency;
- AI boundaries use deterministic fakes/stubs/fixtures where appropriate;
- model quality evaluation is separate from deterministic software testing.

Verifier testing must cover known-valid, known-invalid, edge cases, and verifier infrastructure failures. Verifier failure must not become learner failure. Flaky tests are defects.

## M4.8 — CI, Build & Delivery Pipeline

Minimum PR pipeline:

```text
dependency integrity
→ config validation
→ format/lint
→ static/type checks
→ unit tests
→ integration/contract tests
→ migration validation
→ build
→ relevant security checks
```

Rules:

- required status checks gate merge;
- builds use locked dependencies;
- main remains buildable;
- secrets protected from CI logs;
- CI permissions least privilege;
- CI independent of developer-local state;
- artifacts built once and promoted where compatible with M3 deployment model;
- no uncontrolled auto-production deployment introduced by M4.

## M4.9 — Security, Observability & Runtime Reliability Baseline

Observability:

- structured logs;
- request/operation correlation where relevant;
- consistent machine-readable error classification;
- liveness/readiness where runtime needs both;
- instrumentation permits future metrics/tracing without rewrite.

Do not log by default:

- passwords;
- tokens;
- credentials;
- session secrets;
- authorization headers;
- sensitive personal data;
- raw learner artifacts;
- raw AI conversation/prompt content.

AI-safe metadata may include provider/model identifier, latency, status, token/cost metadata, correlation ID, and sanitized error category.

Security baseline:

- input validation at trust boundaries;
- authn/authz follows M3;
- protected capabilities use default-deny where applicable;
- production errors sanitized;
- dependency/secret scanning integrated where supported;
- security-sensitive operations support audit events.

Reliability baseline:

- external calls have explicit timeouts;
- retries bounded and only for safe/retryable operations;
- infinite retries prohibited;
- idempotency used where duplicate execution is possible.

## M4.10 — Implementation Foundation Integration Review

Golden engineering path:

```text
fresh repo
→ bootstrap
→ validate config
→ provision local infrastructure
→ migrate DB
→ seed allowed dev data
→ start runtime
→ health checks
→ static checks
→ unit tests
→ integration/contract tests
→ build artifacts
→ CI-equivalent verification
```

Final rules:

### Rule A — One canonical path
No competing setup/test/build workflows.

### Rule B — CI is authoritative
Local hooks help; CI decides mergeability.

### Rule C — Domain boundaries remain enforceable
Feature velocity does not permit bypassing architecture.

### Rule D — External nondeterminism stays behind adapters
AI/external APIs do not leak into deterministic core.

### Rule E — Security/privacy defaults are safe
Sensitive diagnostics are opt-in.

### Rule F — Complexity must earn its place
New framework/tool/service requires a concrete problem.

## Final M4 Status

M4.1–M4.10 and M4 overall are 🔒 LOCKED.

## Recovery Evidence

- Source artifact: `AI-Native-Skill-Learning-Platform_M0-M5_LOCKED_Context.md`
- Source states that M4/M5 sections contain the complete final decisions from implementation-foundation/core-learning work.
- Original status: M4.1–M4.10 and M4 overall 🔒 LOCKED
- Recovery date: 2026-09-12
- Recovery action: Canonicalized for M12 implementation baseline
- Ambiguities requiring Change Review: none identified in recovered M4 decisions
