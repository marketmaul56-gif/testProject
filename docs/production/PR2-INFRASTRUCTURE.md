# PR.2 — Infrastructure Provisioning & Security Hardening

Status: **🔒 LOCKED — IaC / INFRASTRUCTURE-DEFINITION BASELINE; LIVE AWS EXECUTION DEFERRED**

Parent baseline: **M0–M12 🔒 LOCKED; PR.1 🔒 LOCKED**

Scope decision: `CHANGE-REVIEW-PR2-AWS-EXECUTION-DEFERRED.md` — **ACCEPTED**

PR.2 materializes the locked AWS Jakarta production binding as testable OpenTofu infrastructure. It does not change product scope, authority semantics, AI boundaries, verifier semantics, or application architecture.

The project owner has explicitly chosen to continue without involving a live AWS account. Therefore PR.2 now locks the validated infrastructure-definition/security-hardening baseline only. Live AWS provisioning and environment evidence are deferred and must never be represented as PASS unless they are actually executed later.

## Build

Implemented provider-specific infrastructure foundation:

- AWS region locked to `ap-southeast-3`;
- two-AZ VPC with public/application/data subnet separation;
- redundant NAT gateways for trusted application egress;
- public ALB foundation for Web/API, with TLS listener created only after an ACM certificate ARN is supplied;
- private verifier dispatcher ALB reachable only from the trusted worker security group;
- immutable ECR repositories for Web/API/Worker/Verifier Dispatcher;
- ECS cluster with container insights and separate task roles;
- RDS PostgreSQL 18 Multi-AZ, encrypted, private, TLS-forced, backup-enabled, deletion-protected;
- ElastiCache Redis Multi-AZ, private, AUTH-protected, encrypted at rest/in transit;
- private versioned S3 project-artifact bucket with public access blocked and TLS-only policy;
- Secrets Manager containers for runtime secrets without secret values in Git;
- dedicated EC2 verifier-host launch template with no public IP/SSH, IMDSv2, encrypted root disk, SSM management, pinned `runsc` URL+SHA-512 bootstrap, and separate IAM/security boundary;
- private/encrypted/versioned OpenTofu state bootstrap with DynamoDB state locking;
- GitHub Actions OIDC federation restricted to the immutable repository/main subject, with a scoped release role rather than static AWS access keys;
- provider-specific static security assertions and CI offline plan gate;
- repository ignore rules preventing local OpenTofu state, plan files, and production tfvars from accidental commit.

The verifier ASG defaults to zero desired capacity. This is intentional: PR.2 defines the hardened host foundation. Any future live activation remains a separate environment-execution action and is not implied by this LOCK.

## Critical Review

### Finding CR-01 — Do not store production secret values in Git

Resolution: OpenTofu creates Secrets Manager containers only. Runtime values are populated only when an environment is actually deployed. Redis AUTH is an apply-time sensitive variable and must be supplied through a secure operator/CI secret channel; it is never committed.

### Finding CR-02 — PostgreSQL and Redis must not be internet-public

Resolution: both are defined for data subnets with no default internet route. RDS explicitly sets `publicly_accessible=false`; security groups permit PostgreSQL only from API/Worker and Redis only from Worker.

### Finding CR-03 — Redis must not become authority

Resolution: infrastructure documentation and naming explicitly retain PostgreSQL transactional outbox as canonical. Redis is delivery/wakeup only.

### Finding CR-04 — Fargate cannot host the locked gVisor verifier boundary

Resolution: trusted Web/API/Worker remain defined on ECS/Fargate, while hostile learner execution is defined for dedicated EC2 verifier capacity with a pinned `runsc` bootstrap and no public ingress.

### Finding CR-05 — Verifier nodes must not start before executable release inputs exist

Resolution: verifier ASG desired capacity defaults to zero. Live activation is deferred together with AWS environment execution.

### Finding CR-06 — IaC state itself is sensitive infrastructure

Resolution: dedicated bootstrap defines a private, encrypted, versioned state bucket and DynamoDB lock table with `prevent_destroy` protection. Local state, plans, and production tfvars are ignored by Git.

### Finding CR-07 — CI must not depend on static AWS access keys

Resolution: a GitHub Actions OIDC provider and release role are defined. Trust is restricted to audience `sts.amazonaws.com` and the immutable repository/main subject. The release policy is scoped to ECR promotion, ECS release operations, application-task-role pass-through, and verifier capacity control.

### Finding CR-08 — Verifier activation must remain declarative

Resolution: the ASG is attached to the private verifier target group and tied to the launch template's latest version with rolling refresh semantics. If live deployment is resumed later, verifier activation remains declarative and reviewable.

### Finding CR-09 — Offline IaC validation must not be confused with deployed infrastructure

Resolution: accepted Change Review separates the two states explicitly. The IaC baseline may be locked because its code/architecture gates passed; live AWS provisioning remains `DEFERRED`, never `PASS` by implication.

## Revision

The final Build incorporates all Critical Review findings plus the accepted PR.2 scope change. No M0–M12 decision is changed. PR.1 remains the locked provider/reference target; only live cloud execution is removed from the current execution scope.

## Functional / Quality Gate

Code-level gate evidence:

1. OpenTofu formatter — PASS.
2. State-bootstrap `init -backend=false` + `validate` — PASS.
3. Production root `init -backend=false` + `validate` — PASS.
4. Offline graph plan — PASS.
5. Security contract assertions — PASS.
6. Unexpected destroy-action check — PASS.
7. Bootstrap Integrity workflow — PASS.
8. Full M12 regression on the PR.2 merge candidate — PASS.

Evidence includes:

- PR.2 Infrastructure Gate run `34731032229` — PASS.
- Bootstrap Integrity run `34731032322` — PASS.
- M12 CI run `34731032203` — PASS.
- M12 OCI Artifact Smoke run `34731032241` — PASS.
- M12 Object Storage Integration run `34731032267` — PASS.
- M12 Redis Authority Transport run `34731032262` — PASS.
- M12 Recovery Drill run `34731032310` — PASS.
- M12 gVisor Hostile Rehearsal run `34731032271` — PASS.

The offline graph gate validates provider schema/dependency graph without claiming that an AWS account has been contacted.

## Final Review

### Code / architecture review

**PASS.** The AWS-targeted infrastructure definition is internally consistent, provider-bound, security-hardened, and preserves the M12 authority model.

### Live environment review

**DEFERRED / OUT OF CURRENT EXECUTION SCOPE.** No claim is made for:

- AWS account ownership or region enablement;
- remote-state bootstrap actually applied;
- real `tofu plan/apply` against AWS APIs;
- deployed resource IDs/endpoints;
- live RDS PITR evidence;
- live Redis/S3/ALB policy verification;
- live EC2 verifier-host rehearsal inside an AWS production VPC.

These items remain future deployment evidence only.

## Functional / Quality Decision

**INFRASTRUCTURE-DEFINITION / IaC BASELINE — PASS**

**LIVE AWS PROVISIONING — ⏸ DEFERRED BY PROJECT-OWNER DECISION**

## LOCK

**🔒 LOCKED — PR.2 IaC / Infrastructure-Definition Baseline.**

Lock scope is explicit: this LOCK protects the reviewed OpenTofu architecture, security boundaries, deployment contracts, and CI evidence. It does **not** mean that AWS infrastructure exists or that a production cloud environment has been verified.

Any future attempt to claim live AWS deployment readiness must produce real environment evidence first. Replacing AWS as the provider/reference target would require a Change Review of PR.1.
