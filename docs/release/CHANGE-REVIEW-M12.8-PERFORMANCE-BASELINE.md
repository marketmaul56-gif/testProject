# Change Review — M12.8 Performance Baseline Recovery

Status: **PENDING EXPLICIT APPROVAL**

Date: 2026-09-12

## Problem

M12.8 requires the implemented performance baseline to be evaluated against the numeric targets established in LOCKED M11. The exact numeric M11 performance targets are not present in the recovered repository baseline or currently available project artifacts.

The implementation has already produced repeatable measurements on the representative MVP dataset, but declaring PASS without a target would fabricate a locked requirement and violate change-control integrity.

Current measured evidence from M12 CI run `34698420579`:

- dataset: 50 learners, 20 lessons, 1,000 lesson-progress rows;
- learner overview: p50 4.01 ms, p95 4.57 ms, max 5.17 ms;
- instructor cohort overview: p50 28.75 ms, p95 29.45 ms, max 30.52 ms.

## Affected LOCKED decision

Only the unavailable **numeric MVP performance targets referenced by M11 release-readiness and consumed by M12.8** are affected.

This Change Review does **not** reopen or modify:

- M11 architecture/security/authority/reliability decisions;
- M0–M10;
- canonical competence authority chain;
- M12.1–M12.7 LOCKED implementation decisions;
- verifier isolation requirements;
- production deployment or backup/restore requirements.

## Why the conflict exists

The M11 milestone is known to be LOCKED, and M12 explicitly requires M11 performance targets, but the exact numeric values were not recovered into `docs/locked`. Continuing with no threshold blocks M12.8. Inventing historical values and labelling them as original M11 decisions would be incorrect.

This is therefore a **baseline-recovery conflict**, not evidence that the implemented system violates a known performance target.

## Alternatives considered

### Alternative A — Keep M12.8 blocked until original M11 artifact is recovered

Pros:
- preserves the original baseline exactly.

Cons:
- indefinite blocker;
- original numeric values are not currently recoverable from the available artifacts;
- prevents otherwise complete executable release testing from advancing.

### Alternative B — Treat current measurements themselves as the target

Rejected.

Reason:
- a target derived directly from the implementation under test provides no meaningful regression headroom;
- it would turn the current implementation into its own acceptance criterion.

### Alternative C — Replace only the missing numeric targets with explicit MVP release thresholds

Recommended.

Proposed replacement gate, on the same representative dataset and CI test semantics:

| Read path | Replacement release target |
|---|---:|
| Learner overview | p95 <= 100 ms |
| Instructor cohort overview | p95 <= 200 ms |

Supporting rules:

1. Dataset minimum for this gate remains **50 learners / 20 lessons / 1,000 lesson-progress rows**.
2. Gate is evaluated on p95, not single-sample maximum, to reduce hosted-runner noise.
3. A run that exceeds either p95 threshold is **BLOCKED**, followed by profile → optimize → retest.
4. These thresholds apply specifically to the current server-side read-model performance gate. They do not claim browser/network latency or verifier execution latency.
5. M12.9 still requires production-like smoke, observability validation, verifier-host rehearsal, and operational readiness; those requirements are not weakened.

Rationale for the proposed thresholds:

- independent from the exact measured values rather than copying them;
- strict enough to detect large N+1/query-plan regressions in MVP read paths;
- include reasonable CI/runtime variance headroom;
- preserve the MVP principle of simple, responsive operational/learning views without creating premature enterprise-scale requirements.

Against current evidence:

- learner p95 4.57 ms vs 100 ms target: PASS;
- instructor p95 29.45 ms vs 200 ms target: PASS.

## Product/UX/Architecture/Data/AI/Security impact

### Product

No feature or scope expansion. This only restores a measurable release criterion for existing MVP read paths.

### UX

No interaction model change. The thresholds protect responsive learner/instructor views.

### Architecture

No architecture change. Existing Next.js/NestJS/PostgreSQL/module boundaries remain unchanged.

### Data

No schema or migration change. The representative dataset definition becomes part of the executable performance gate.

### AI

No AI behavior or authority change.

### Security

No security relaxation. Authorization, tenant isolation, hidden verifier boundaries, and evidence/competency authority remain unchanged.

## Migration implication

No production data migration is required.

Repository/documentation changes after approval:

1. record this Change Review as `ACCEPT`;
2. amend M12.8 test documentation to use the replacement thresholds;
3. make `tests/performance/read-model-baseline.test.ts` assert the approved p95 targets;
4. rerun M12 CI;
5. only if the run passes, resolve `RB-M12-008-001` and proceed to M12.8 Final Review/LOCK.

## Backward compatibility implication

No runtime API, database, learner, instructor, verifier, evidence, or competency compatibility impact.

Governance impact only: the missing M11 numeric target reference is replaced prospectively and transparently by this approved Change Review. It must never be described as the original recovered M11 number.

## Recommendation

**ACCEPT Alternative C** with the following bounded replacement targets:

- learner overview p95 <= **100 ms**;
- instructor cohort overview p95 <= **200 ms**;
- representative dataset minimum: **50 learners, 20 lessons, 1,000 progress rows**.

This is the smallest change that resolves the unrecoverable numeric baseline while preserving all other LOCKED decisions and maintaining an objective executable release gate.

## Decision

- [ ] REJECT — keep LOCKED baseline and M12.8 blocked
- [ ] ACCEPT — amend only the unavailable numeric performance baseline as specified above

Current decision: **PENDING EXPLICIT USER APPROVAL**.

## Approval evidence

Pending explicit user statement accepting or rejecting this Change Review.

After explicit acceptance, the repository will be updated with the approval evidence and the replacement target will become the controlling baseline for M12.8 performance evaluation.
