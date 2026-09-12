# AI-Native Skill Learning Platform

## Repository Bootstrap for M12

This repository is the implementation workspace for **M12 — Implementation Completion & Release Execution**.

The product, UX, architecture, vertical-slice, and release-readiness decisions from **00 and M0–M11 are LOCKED constraints**. This repository must not silently redesign those decisions.

## Current repository state

This bootstrap intentionally does **not** select or replace the technology stack, framework, database, auth mechanism, monorepo layout, or deployment platform. Those decisions belong to the LOCKED M3/M4 baseline and must be recovered before production application code is generated.

Current status:

- M0–M11: LOCKED specification baseline
- M12.1: repository bootstrap available, implementation audit pending
- M12.2–M12.10: not yet eligible for PASS/LOCK

## Product invariant

> Completion is not competence. Evidence proves competence.

Only this authority chain may produce measurable competence:

```text
Artifact
→ Submission
→ Authoritative Verification
→ Skill Evidence
→ Deterministic Competency Projection
→ Measurable Competence View
```

No lesson completion, practice completion, project completion, cohort completion, instructor action, admin privilege, or AI output may create evidence or competence.

## Repository rules

1. Requirement before implementation.
2. Keep traceability: requirement → decision → implementation → test → release gate.
3. Do not alter M0–M11 without explicit Change Review.
4. AI coaching remains formative only.
5. Verification remains authoritative.
6. Evidence and competency authority must not be duplicated.
7. Cross-tenant and object-level authorization are server-side.
8. Retry must not duplicate authoritative effects.
9. Infrastructure/system failure must never become learner FAIL.
10. Submitted/published immutable revisions remain immutable.

## Before writing production code

Recover and commit the LOCKED M3/M4 decisions into:

- `docs/locked/M3-technology-foundation.md`
- `docs/locked/M4-engineering-foundation.md`

Use `docs/locked/M3-M4-RECOVERY-TEMPLATE.md` if the original decision record is not immediately available.

## M12 sequence

```text
M12.1 Gap Audit & Traceability
→ M12.2 Domain & Persistence
→ M12.3 API/Auth/Security
→ M12.4 Learner/Instructor UX
→ M12.5 AI Coaching Integration
→ M12.6 Verification/Evidence/Competency
→ M12.7 Cohort Operations
→ M12.8 Integration/Security/Reliability/Performance Tests
→ M12.9 Release Candidate
→ M12.10 Production Release Gate
```

No milestone is LOCKED until its functional/quality gate passes with actual implementation evidence.
