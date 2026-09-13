# PR.2 — Infrastructure Provisioning & Security Hardening

Status: **QUALITY GATE PASS — AWS APPLY EVIDENCE PENDING / NOT LOCKED**

Parent baseline: **M0–M12 🔒 LOCKED; PR.1 🔒 LOCKED**

Branch: `production/pr2-infrastructure`

PR.2 materializes the locked AWS Jakarta production binding as testable OpenTofu infrastructure. It does not change product scope, authority semantics, AI boundaries, verifier semantics, or application architecture.

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

The verifier ASG defaults to zero desired capacity. This is intentional: PR.2 defines the hardened host foundation, while PR.3 supplies the immutable dispatcher/runtime inputs and activates reviewed capacity. Starting a verifier before rootfs/hidden-test/runtime inputs are bound would create an unhealthy or unsafe environment.

## Critical Review

### Finding CR-01 — Do not store production secret values in Git

Resolution: OpenTofu creates Secrets Manager containers only. Runtime values are populated at release time. Redis AUTH is an apply-time sensitive variable and must be supplied through a secure operator/CI secret channel; it is never committed.

### Finding CR-02 — PostgreSQL and Redis must not be internet-public

Resolution: both reside in data subnets with no default internet route. RDS explicitly sets `publicly_accessible=false`; security groups permit PostgreSQL only from API/Worker and Redis only from Worker.

### Finding CR-03 — Redis must not become authority

Resolution: infrastructure documentation and naming explicitly retain PostgreSQL transactional outbox as canonical. Redis is delivery/wakeup only.

### Finding CR-04 — Fargate cannot host the locked gVisor verifier boundary

Resolution: trusted Web/API/Worker remain on ECS/Fargate, while hostile learner execution uses dedicated EC2 verifier capacity with a pinned `runsc` bootstrap and no public ingress.

### Finding CR-05 — Verifier nodes must not start before executable release inputs exist

Resolution: verifier ASG desired capacity defaults to zero in PR.2. Activation is a PR.3 release step after image/rootfs/hidden bundle/token inputs are bound and the hostile rehearsal can be rerun on the actual host.

### Finding CR-06 — IaC state itself is sensitive infrastructure

Resolution: dedicated bootstrap creates a private, encrypted, versioned state bucket and DynamoDB lock table with `prevent_destroy` protection. Local state, plans, and production tfvars are ignored by Git.

### Finding CR-07 — CI must not depend on static AWS access keys

Resolution: a GitHub Actions OIDC provider and release role are defined. Trust is restricted to audience `sts.amazonaws.com` and the immutable subject `repo:marketmaul56-gif@326277591/testProject@1360769907:ref:refs/heads/main`. The release policy is scoped to ECR promotion, ECS release operations, application-task-role pass-through, and verifier capacity control.

### Finding CR-08 — Verifier activation must remain declarative

Resolution: removed the ASG `desired_capacity` ignore rule, attached the ASG to the private verifier target group, and tied the ASG to the launch template's actual latest version with rolling refresh semantics. PR.3 can therefore intentionally activate and replace verifier capacity through reviewed IaC.

## Revision

The final Build incorporates all eight Critical Review findings. No Change Review of M0–M12 is required because this milestone implements the provider binding already authorized by PR.1.

## Functional / Quality Gate

Final code-level gate on branch SHA `084d08aea0f113c0580aea8075539b658dbe3316`:

1. OpenTofu formatter — PASS.
2. State-bootstrap `init -backend=false` + `validate` — PASS.
3. Production root `init -backend=false` + `validate` — PASS.
4. Offline graph plan — PASS.
5. Security contract assertions — PASS.
6. Unexpected destroy-action check — PASS.
7. Bootstrap Integrity workflow — PASS.

Evidence:

- PR.2 Infrastructure Gate run `34730952011` — PASS.
- Bootstrap Integrity run `34730952043` — PASS.

The offline graph gate uses the exact AWS provider constraint selected during validation (`hashicorp/aws = 6.64.0`). It validates resource schema/dependency graph without pretending that an AWS account has been contacted.

## Final Review

### Code / architecture review

**PASS.** The AWS production foundation is internally consistent, provider-bound, security-hardened, and preserves the M12 authority model.

### Environment execution review

**PENDING.** The following evidence cannot be produced honestly without authorized access to the target AWS account:

- AWS account ID / ownership record;
- Jakarta opt-in region enabled in that account;
- remote-state bootstrap actually applied;
- real `tofu plan` against AWS APIs;
- reviewed `tofu apply` result and resource IDs;
- live RDS backup/PITR settings;
- live Redis/S3/ALB policies/endpoints;
- live EC2 verifier-host `runsc` rehearsal in the production VPC.

These are execution gates, not application-code defects.

## Functional / Quality Decision

**PROVISIONABLE INFRASTRUCTURE BASELINE — PASS**

**ACTUAL PRODUCTION INFRASTRUCTURE PROVISIONING — PENDING AUTHORIZED AWS ENVIRONMENT**

## LOCK

**NOT LOCKED.** PR.2 cannot be called “Infrastructure Provisioning complete” until an authorized AWS account is actually planned/applied and the resulting environment evidence passes review. Locking it now would incorrectly equate an offline IaC plan with a real production environment.

Next required evidence: execute the state bootstrap and production OpenTofu plan/apply in the selected AWS account, record outputs without secret values, then run the environment security/PITR/verifier checks before PR.2 Final LOCK.
