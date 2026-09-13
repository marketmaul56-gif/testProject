# PR.2 — Infrastructure Provisioning & Security Hardening

Status: **BUILD COMPLETE — QUALITY GATE PENDING**

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
- provider-specific static security assertions and CI offline plan gate.

The verifier ASG defaults to zero desired capacity. This is intentional: PR.2 provisions the hardened host foundation, while PR.3 supplies the immutable dispatcher/runtime inputs and activates reviewed capacity. Starting a verifier before rootfs/hidden-test/runtime inputs are bound would create an unhealthy or unsafe environment.

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

Resolution: dedicated bootstrap creates a private, encrypted, versioned state bucket and DynamoDB lock table with `prevent_destroy` protection.

## Revision

The final Build incorporates all six Critical Review findings. No Change Review of M0–M12 is required because this milestone implements the provider binding already authorized by PR.1.

## Functional / Quality Gate

Required before PR.2 can LOCK:

1. OpenTofu formatter gate passes.
2. State-bootstrap root initializes and validates.
3. Production root initializes and validates against the pinned provider constraint.
4. Offline graph plan succeeds with no destroy action.
5. Security assertions prove private RDS, encrypted Redis, blocked-public S3, immutable ECR, IMDSv2, no verifier public IP, and pinned runsc checksum verification.
6. M12 application baseline remains unchanged.

Environment-only evidence that **cannot** be claimed by an offline CI gate:

- AWS account ownership/ID;
- Jakarta region enablement in the actual account;
- real `tofu plan/apply` against AWS;
- actual RDS/Redis/S3/ALB resource IDs;
- live AWS PITR evidence;
- live verifier EC2/runsc rehearsal.

Those require authorized AWS account access and will remain explicit Production Release evidence rather than being fabricated by CI.

## Final Review

Pending executable PR.2 CI evidence.

## LOCK

**NOT YET LOCKED.**
