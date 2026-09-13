# Change Review — PR.2 Live AWS Execution Deferred

Status: **ACCEPTED**

Date: **2026-09-13**

Affected milestone: **PR.2 — Infrastructure Provisioning & Security Hardening**

Parent constraints: **M0–M12 🔒 LOCKED; PR.1 🔒 LOCKED**

## Problem

The PR.2 code-level infrastructure baseline is complete and validated, but the remaining acceptance evidence requires direct access to a real AWS account in `ap-southeast-3` for state bootstrap, `tofu plan/apply`, resource inspection, PITR evidence, and live verifier-host rehearsal.

The project owner has explicitly chosen to skip that environment-execution step and continue the project without involving a live AWS account.

## Affected locked decision

No M0–M12 decision is changed.

PR.1 remains locked as the provider-binding/reference deployment target: **AWS Asia Pacific (Jakarta), `ap-southeast-3`**. This Change Review does **not** replace AWS with another provider and does not alter the application architecture or authority model.

The only scope change is the PR.2 completion criterion: live AWS provisioning is removed from the current execution scope and retained as deferred deployment work.

## Reason

The current project goal is to continue implementation/release engineering without requiring external cloud-account access. The AWS-bound OpenTofu remains useful as a production deployment reference, but actual cloud execution is intentionally out of scope for the current continuation.

## Alternatives considered

1. **Require live AWS apply before continuing.** Rejected by project-owner decision.
2. **Change provider away from AWS.** Rejected because that would reopen PR.1 and create unnecessary architecture churn.
3. **Delete AWS IaC.** Rejected because the validated provider-bound deployment baseline remains useful and already preserves the locked architecture.
4. **Defer live AWS execution while locking the validated IaC baseline.** Accepted.

## Impact

- The project may continue to PR.3 and later production-readiness work using local/CI/provider-neutral verification where possible.
- No future milestone may claim that AWS infrastructure is deployed, reachable, hardened in vivo, or production-ready unless live environment evidence is later supplied.
- AWS-specific runtime checks that require a real account remain **DEFERRED**, not PASS.
- Existing M12 correctness, authority, security, and isolation invariants remain unchanged.
- Production release status must distinguish **release artifact/readiness** from **live cloud deployment**.

## Migration implication

None for application/domain data. If live AWS deployment is resumed later, execute the existing OpenTofu state bootstrap and production plan/apply from the locked baseline, then perform environment-specific security, recovery, and verifier-host checks.

## Recommendation

Adopt a two-layer status model:

- **PR.2 IaC / infrastructure-definition baseline: 🔒 LOCKED**
- **Live AWS provisioning & environment evidence: ⏸ DEFERRED / OUT OF CURRENT EXECUTION SCOPE**

This preserves traceability without falsely equating offline validation with an actual deployed production environment.

## Decision

- [x] ACCEPT — defer all live AWS interaction and continue without involving an AWS account.
- [ ] REJECT

## Approval evidence

Project-owner instruction in chat on 2026-09-13: **“step ini akan saya lewat, jadi tanpa melibatkan AWS”**.
