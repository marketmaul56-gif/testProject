# PR.5 — Go-Live Gate

Status: **BUILD COMPLETE — QUALITY GATE PENDING**

Parent baseline: **M0–M12 🔒 LOCKED; PR.1–PR.4 🔒 LOCKED**

Execution mode: **provider-neutral go-live control rehearsal; live environment and public traffic remain DEFERRED**.

## Purpose

PR.5 converts the locked release/deployment evidence into an explicit release-control decision. Because the project owner has chosen not to involve a live AWS environment, this milestone must distinguish two different outcomes:

- **release/readiness control baseline:** may PASS and LOCK;
- **actual public production go-live:** remains NO-GO / DEFERRED until live environment evidence exists.

## Build

PR.5 adds a machine-readable go-live policy and evaluator that require:

- PR.3 release artifact baseline locked;
- PR.4 deployment rehearsal baseline locked;
- release artifact, deployment rehearsal, rollback, security, authority and gVisor offline gates = PASS;
- public domain/TLS, live secrets, registry promotion, production migration, live backup and public traffic = DEFERRED;
- competence authority invariants remain unchanged.

## Critical Review

### CR-01 — Readiness must not be mislabeled as production live

Resolution: the only valid decision in the current execution mode is `NO_GO_LIVE_TRAFFIC__READINESS_BASELINE_PASS`. The evaluator rejects any policy that converts live provider execution or public traffic from `DEFERRED`.

### CR-02 — Go-live control must remain machine-checkable

Resolution: gate state is stored in `infrastructure/deployment/go-live-gate.json` and validated by `scripts/evaluate-go-live.mjs`, rather than relying on prose alone.

### CR-03 — Product authority invariants are release blockers

Resolution: the evaluator rejects completion-as-competence, AI PASS/FAIL authority, admin/instructor evidence creation, non-authoritative evidence creation, or mutable competency projection semantics.

### CR-04 — Security and API contracts must remain green

Resolution: PR.5 executes security and contract regressions in addition to the machine-readable release decision policy.

## Revision

Build incorporates CR-01 through CR-04. No locked Product, Domain, Data, AI or Security authority decision is changed.

## Functional / Quality Gate

PR.5 may LOCK only when:

1. machine-readable go-live policy evaluation — PASS;
2. PR.3 lock prerequisite — PASS;
3. PR.4 lock prerequisite — PASS;
4. security regression — PASS;
5. contract regression — PASS;
6. accidental `PRODUCTION_LIVE=true` claim scan — PASS;
7. full PR regression remains green.

## Go-Live Decision Semantics

Current allowed decision:

**READINESS BASELINE: PASS**

**PUBLIC PRODUCTION TRAFFIC: NO-GO / DEFERRED**

This is not a failed milestone. It is the correct gate result for a project that intentionally excludes live infrastructure execution.

## Final Review

Pending executable gate evidence.

## LOCK

**NOT YET LOCKED.**
