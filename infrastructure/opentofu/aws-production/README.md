# AWS Production OpenTofu — PR.2

This directory materializes the PR.1 AWS Jakarta binding without changing the M0–M12 authority model.

## Scope

This root provisions the production infrastructure foundation in `ap-southeast-3`:

- multi-AZ VPC with public, application, and data subnets;
- redundant NAT gateways for application egress;
- public ALB foundation for Web/API;
- private ALB foundation for verifier-dispatcher control traffic;
- ECR repositories for the four immutable OCI services;
- ECS cluster and least-privilege task/execution roles;
- RDS PostgreSQL 18 with Multi-AZ, TLS enforcement, encrypted storage, backups, deletion protection, and no public endpoint;
- ElastiCache Redis with Multi-AZ, encryption in transit/at rest, and AUTH;
- private S3 artifact bucket with versioning, TLS-only policy, CORS for presigned uploads, and public access blocked;
- runtime Secrets Manager containers with no secret values committed;
- dedicated EC2 verifier host launch template with IMDSv2, encrypted disk, pinned `runsc` download+checksum bootstrap, SSM access, no inbound SSH, and separate verifier security boundary.

ECS task definitions/services and live secret values are intentionally deferred to PR.3 because they depend on immutable OCI digests, production domains, and release-time credentials. The verifier ASG starts at desired capacity `0`; PR.3 enables the reviewed host only after the dispatcher image/rootfs/hidden-test bundle inputs are ready.

## State bootstrap

The `bootstrap/` directory creates a private, encrypted, versioned S3 state bucket and DynamoDB lock table. Apply it once with a tightly scoped AWS administrator identity, then initialize this root with the emitted backend values.

Example only:

```bash
tofu -chdir=bootstrap init
tofu -chdir=bootstrap apply \
  -var='state_bucket_name=REPLACE-GLOBALLY-UNIQUE'

tofu init \
  -backend-config='bucket=REPLACE' \
  -backend-config='key=production/skill-platform.tfstate' \
  -backend-config='region=ap-southeast-3' \
  -backend-config='dynamodb_table=skill-platform-production-opentofu-locks' \
  -backend-config='encrypt=true'
```

## Safe plan workflow

Real production planning must use short-lived AWS credentials, preferably GitHub Actions OIDC or an operator session. Do not create static repository AWS keys.

```bash
cp production.tfvars.example production.tfvars
# replace placeholders outside Git
export TF_VAR_redis_auth_token='...'
tofu init <backend config>
tofu fmt -check -recursive
tofu validate
tofu plan -var-file=production.tfvars
```

## Security invariants

- `offline_validation=true` exists only for CI syntax/graph checks and must never be used for a real apply.
- RDS and Redis are not public.
- Redis is transport only; PostgreSQL outbox remains canonical.
- S3 bucket public access is blocked and insecure transport is denied.
- Real secrets are absent from Git and OCI layers.
- Verifier hosts have no public IP or SSH ingress.
- Learner execution remains inside `runsc` with the application-level no-network/resource-limit contract already locked in M12.
- Dedicated verifier capacity is not attached to live traffic until PR.3 supplies the reviewed runtime image/rootfs/hidden-test bundle and reruns the hostile rehearsal.

## Not a production apply record

A successful CI validation of this directory proves the IaC is internally consistent. It does **not** prove that resources already exist in an AWS account. Actual `plan/apply`, AWS account/region enablement, generated resource IDs, PITR evidence, and live verifier-host rehearsal are environment evidence and must be recorded before go-live.
