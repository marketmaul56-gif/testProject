# Change Review — M12.9 Production Canonical Runtime Wiring

Status: **PENDING EXPLICIT APPROVAL**

Date: 2026-09-12

## Problem

M12.8 proves the canonical learner/instructor journey and authority chain at service/database integration level. M12.9 release audit found that the production runtime tree does not yet expose the complete learner submission → authoritative verification → evidence/projection path through deployable API/worker/dispatcher entrypoints.

Current deployable API routes cover learner/instructor reads, instructor formative guidance, authentication, readiness, and AI coaching. The repository contains verification authority/domain code and verifier-dispatcher sandbox components, but no complete trusted worker runtime is present under `apps/worker`, and the verifier-dispatcher has no production executable entrypoint that completes the canonical async path.

Therefore an RC would risk passing tests while leaving the core authoritative learner flow unusable through the deployed runtime. Under M12 release rules, “critical flow unusable” is a release blocker.

## Affected LOCKED decision

This review requests a **narrow implementation reopening only**, not a product/domain redesign.

Affected implementation baselines:

- M12.4 — Learner & Instructor UX Integration, only where learner submission actions need a production API path;
- M12.6 — Verification / Evidence / Competency Authority Completion, only where the already-locked authority services must be wired into production worker/dispatcher entrypoints;
- M4 engineering runtime structure, only to materialize the already-defined `apps/worker` / async execution responsibility in executable form.

Not reopened or changed:

- canonical competence authority chain;
- PASS/FAIL semantics;
- evidence provenance/uniqueness;
- deterministic competency projection;
- AI formative-only boundary;
- instructor/admin non-authority;
- tenant/object authorization;
- verifier isolation contract;
- immutable revision rules;
- system failure != learner FAIL;
- product scope.

## Why the conflict exists

Implementation milestones successfully established domain, persistence, API read models, security, authority services, and executable integration tests. M12.9 is the first milestone that evaluates deployable runtime completeness rather than service-level correctness alone.

The release audit revealed that tests can invoke authority services directly, while the production runtime still lacks the complete orchestration path that a real learner request requires.

This is an **implementation completeness gap discovered by release rehearsal**, not a reason to change the locked authority model.

## Alternatives considered

### Alternative A — Ship/RC with service-level E2E only

Rejected.

Reason:
- violates the M12 release blocker rule for unusable critical flow;
- deployable API would not represent the journey that the tests prove;
- operational readiness cannot compensate for missing product runtime wiring.

### Alternative B — Keep M12.9 blocked indefinitely and make no change

Safe but not useful. It preserves LOCK mechanically while preventing a production-capable MVP.

### Alternative C — Narrowly reopen implementation wiring and preserve every locked semantic

Recommended.

Scope of the amendment:

1. add learner-owned practice/project submission command endpoints with server-side tenant/object authorization and idempotency;
2. enqueue/dispatch verification through the existing authoritative verification service rather than creating a second verifier/evidence engine;
3. add a trusted `apps/worker` runtime for outbox/authority processing with bounded retry/idempotency;
4. add an executable verifier-dispatcher entrypoint that uses the locked runsc sandbox contract and never receives production authority credentials beyond the minimum task contract;
5. wire PASSED verification events to the existing evidence/projector path exactly once;
6. expose learner status through existing read models; no manual competence controls;
7. add runtime-level E2E that goes through deployable API/worker boundaries, including duplicate request, verifier unavailable, evidence-write retry, cross-tenant denial, and AI outage;
8. retain all existing DB constraints and authority regression tests.

No new microservice architecture is authorized. These remain deployable processes in the locked modular monolith/workspace model.

## Product / UX impact

No feature expansion. This completes the already-required authentic practice/project submission journey so the locked UX can invoke the authoritative runtime instead of relying on test-only orchestration.

## Architecture impact

Low and bounded:

- materializes existing API → async worker → verifier-dispatcher → authoritative result → outbox → evidence/projector boundaries;
- reuses PostgreSQL, existing authority services, and the locked async model;
- no duplicate source of truth;
- no speculative services/platform abstractions.

BullMQ/Redis may be used only according to the already-locked M3 async stack. If introducing it would add release risk without changing correctness, the implementation may keep PostgreSQL outbox as authority and use queue transport only as a wake-up/delivery mechanism. Database authority remains canonical.

## Data impact

Prefer no new authority tables. Any persistence addition must be limited to delivery/runtime bookkeeping and must not become a second source of truth for submission, verification, evidence, or competency.

Existing idempotency/provenance constraints remain mandatory.

## AI impact

None. AI remains optional/formative and must not enter authoritative worker/evidence paths.

## Security impact

The amendment must preserve or strengthen:

- server-side tenant and object authorization;
- learner ownership checks;
- hidden-test non-disclosure;
- least-privilege worker/dispatcher credentials;
- no authority state controlled by client payload;
- verifier network isolation and no production credentials;
- sanitized errors/logging.

## Migration implication

No migration is desired unless runtime bookkeeping makes one strictly necessary. Any migration must be additive, rehearsed on PostgreSQL 18, and preserve current authority/immutability triggers.

## Backward compatibility implication

Existing read APIs, instructor workflows, evidence records, competency projection, and authority semantics remain compatible. New command/runtime paths are additive.

## Acceptance criteria after approval

The narrow reopening is considered complete only if:

- a learner can submit an authorized practice/project request through the production API boundary;
- duplicate request IDs do not duplicate submission/verification/evidence;
- verifier infrastructure failure produces system ERROR, not learner FAIL;
- PASSED-only results can issue evidence through the existing canonical service;
- competency is still derived only from evidence;
- cross-tenant/other-learner command attempts are denied;
- worker retry after evidence persistence failure is safe;
- deployed/runtime-level E2E passes using the real entrypoints;
- existing M12.1–M12.8 regressions remain green;
- no alternate authority/source of truth is introduced.

## Recommendation

**ACCEPT Alternative C** — narrowly reopen M12.4/M12.6/M4 implementation wiring solely to complete production runtime orchestration while preserving every locked product, domain, authority, security, and data invariant.

## Decision

- [ ] REJECT — keep prior LOCKED implementation unchanged and M12.9 release-blocked
- [ ] ACCEPT — permit the bounded runtime-wiring amendment above

Current decision: **PENDING EXPLICIT USER APPROVAL**.

## Approval evidence

Pending an explicit user statement accepting or rejecting this Change Review.
