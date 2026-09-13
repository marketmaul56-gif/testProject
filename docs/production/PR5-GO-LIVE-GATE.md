# PR.5 — Go-Live Gate

Status: **🔒 LOCKED — GO-LIVE CONTROL / READINESS BASELINE; PUBLIC TRAFFIC DEFERRED**

Parent baseline: **M0–M12 🔒 LOCKED; PR.1–PR.4 🔒 LOCKED**

Execution mode: **provider-neutral go-live control rehearsal; live environment and public traffic remain DEFERRED**.

## Purpose

PR.5 converts the locked release/deployment evidence into an explicit release-control decision. Because the project owner has chosen not to involve a live AWS environment, this milestone distinguishes:

- **release/readiness control baseline:** PASS and LOCKED;
- **actual public production go-live:** NO-GO / DEFERRED until live environment evidence exists.

## Build

PR.5 adds:

- `infrastructure/deployment/go-live-gate.json` as the machine-readable release decision;
- `scripts/evaluate-go-live.mjs` as the policy evaluator;
- `.github/workflows/pr5-go-live-gate.yml` as the executable gate.

The policy requires PR.3 and PR.4 locked, all offline release/deployment/security/authority/gVisor gates PASS, all live-environment actions DEFERRED, and all competence-authority invariants unchanged.

## Critical Review

### CR-01 — Readiness must not be mislabeled as production live

Resolution: the only valid decision in the current execution mode is `NO_GO_LIVE_TRAFFIC__READINESS_BASELINE_PASS`. The evaluator rejects any policy that converts live provider execution or public traffic from `DEFERRED`.

### CR-02 — Go-live control must remain machine-checkable

Resolution: gate state is stored in `infrastructure/deployment/go-live-gate.json` and validated by `scripts/evaluate-go-live.mjs`, rather than relying on prose alone.

### CR-03 — Product authority invariants are release blockers

Resolution: the evaluator rejects completion-as-competence, AI PASS/FAIL authority, admin/instructor evidence creation, non-authoritative evidence creation, or mutable competency projection semantics.

### CR-04 — Security and API contracts must remain green

Resolution: PR.5 executes security and contract regressions in addition to the machine-readable release decision policy.

### CR-05 — A naive forbidden-string scan can self-match governance documentation

The first executable PR.5 gate passed policy evaluation, milestone prerequisites, 27/27 security tests and 10/10 contract tests, but the final textual scan failed because the documentation itself contained the literal marker being searched for.

Resolution: the machine-readable policy remains authoritative, and the forbidden live-enablement marker scan is scoped to executable/deployment artifacts (`infrastructure/deployment` and `scripts`) rather than governance prose. The corrected scan passed.

## Revision

The final Build incorporates CR-01 through CR-05. No locked Product, Domain, Data, AI, Security or authority decision is changed.

## Functional / Quality Gate

Corrected executable candidate: `0c38cc3115245c06188809984740aca9b48e7a35`.

PR.5 Go-Live Control Gate run `34736964849` — **PASS**.

Verified:

1. machine-readable go-live policy evaluation — PASS;
2. decision = `NO_GO_LIVE_TRAFFIC__READINESS_BASELINE_PASS` — PASS;
3. PR.3 lock prerequisite — PASS;
4. PR.4 lock prerequisite — PASS;
5. security regression — PASS, 27/27;
6. contract regression — PASS, 10/10;
7. executable/deployment live-enablement scan — PASS;
8. public traffic remains `DEFERRED` — PASS;
9. live provider execution remains `DEFERRED` — PASS.

Full PR regression is required again on the final LOCK SHA before merge.

## Go-Live Decision Semantics

**READINESS / GO-LIVE CONTROL BASELINE: PASS**

**PUBLIC PRODUCTION TRAFFIC: NO-GO / DEFERRED**

This is the correct gate result for the current project scope and is not a claim that the application is publicly live.

## Final Review

### Product / Authority

**PASS.** Completion, AI, instructor and admin remain outside evidence/competence authority. Evidence remains authoritative-verification-only; competency remains deterministic/read-only.

### Security / Contracts

**PASS.** Security and contract suites remain green, including TOTP platform-admin enforcement, cross-tenant authorization and AI/verifier authority boundaries.

### Release Control

**PASS.** The decision is explicit, machine-readable and fail-closed: offline readiness may PASS, while live environment gates cannot silently become PASS.

### Environment Truthfulness

**PASS.** Public domain/TLS, production secrets, registry promotion, production database migration, live backup and traffic enablement remain DEFERRED.

Final decision: **PASS — Go-Live Control / Readiness Baseline complete; public traffic remains NO-GO / DEFERRED.**

## LOCK

**PR.5 — Go-Live Gate 🔒 LOCKED (control/readiness baseline only).**

Any future transition from `DEFERRED` to actual public traffic requires real live-environment evidence and a new release decision; this LOCK must not be interpreted as `PRODUCTION LIVE`.
