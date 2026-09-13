# PR.1 — Production Environment & Provider Binding

Status: **🔒 LOCKED**

Decision date: **2026-09-13**

Parent baseline: **M0–M12 🔒 LOCKED**

This milestone binds the provider-neutral M12 deployment contract to a concrete production provider and region. It does **not** reopen product, competence-authority, security, or application-architecture decisions.

## Build

### Product / release requirement

The selected production target must support the complete locked MVP without introducing a second source of truth, weakening verifier isolation, or requiring a product redesign.

### Selected provider

- **Cloud provider:** Amazon Web Services (AWS)
- **Primary region:** **Asia Pacific (Jakarta) — `ap-southeast-3`**
- **Environment:** production
- **Infrastructure as Code:** OpenTofu
- **Container artifact format:** immutable OCI images
- **Promotion model:** build once, promote by immutable digest

Jakarta is selected because it keeps the primary production data plane in Indonesia while satisfying the locked runtime requirements. AWS documents `ap-southeast-3` as an opt-in region; account-level region enablement is therefore a PR.2 prerequisite.

### Bound production service map

| Locked capability | AWS production binding | Authority / design note |
|---|---|---|
| Edge/TLS | Application Load Balancer + AWS Certificate Manager | TLS terminates before web/API; no authority semantics here |
| DNS | Route 53 when the production domain is delegated to AWS; otherwise existing DNS provider may point to ALB | Domain registrar is not an application dependency |
| Web runtime | Amazon ECS on AWS Fargate | Next.js OCI image, private application subnet |
| API runtime | Amazon ECS on AWS Fargate | NestJS/Better Auth boundary, private application subnet |
| Trusted authority worker | Amazon ECS on AWS Fargate | PostgreSQL outbox remains canonical; Redis is delivery only |
| OCI registry | Amazon ECR | immutable release digests recorded at promotion |
| PostgreSQL | Amazon RDS for PostgreSQL 18 | trusted MVP state / sole relational SoT; Multi-AZ enabled for production |
| Redis/BullMQ | Amazon ElastiCache for Redis OSS-compatible service | transport/wakeup only; never evidence or competence SoT |
| Artifact bytes | Amazon S3 | private bucket, Block Public Access, presigned PUT, checksum/seal validation |
| Secrets | AWS Secrets Manager + task/instance IAM roles | no long-lived secrets in Git or OCI image |
| App observability | OpenTelemetry -> AWS-supported OTLP collector/backend binding | raw learner artifacts/prompts/hidden tests remain excluded |
| Verifier dispatcher | dedicated EC2 verifier capacity in private subnets | dispatcher is not learner-public |
| Hostile learner execution | gVisor `runsc` on dedicated Linux EC2 verifier hosts | no application/DB/Redis/cloud credentials exposed inside learner sandbox |
| Internal dispatcher routing | private internal load balancer or private service endpoint | server-only token required; no public learner route |
| CI production federation | GitHub Actions OIDC -> scoped AWS IAM role | no static AWS access keys in repository secrets |

### Network topology

```text
Internet
  -> ALB / TLS
     -> ECS Fargate Web
     -> ECS Fargate API

Trusted application plane
  -> RDS PostgreSQL 18 (private)
  -> ElastiCache Redis (private)
  -> S3 private bucket
  -> ECS Worker
       -> private verifier dispatcher endpoint
            -> dedicated EC2 verifier host(s)
                 -> gVisor/runsc hostile sandbox
```

Production will use at least two Availability Zones for the trusted application/database network. Verifier capacity stays separate from the normal application compute plane.

### PostgreSQL binding

RDS PostgreSQL 18 is authoritative for authentication/session state, domain records, transactional outbox, verification result, skill evidence, deterministic competency projection, and audit records.

Required PR.2 configuration:

- PostgreSQL 18;
- Multi-AZ production deployment;
- encrypted storage and TLS;
- no public database endpoint;
- automated backup + PITR targeting **RPO <= 15 minutes**;
- recovery procedure targeting **RTO <= 4 hours**;
- deletion protection in production;
- monitoring for connections, storage, CPU, availability, replication/failover and backup health;
- schema mutations only through version-controlled migrations.

### Redis/BullMQ binding

ElastiCache is delivery infrastructure only. PostgreSQL transactional outbox is still canonical.

MVP choice:

- private subnet;
- TLS/authentication enabled;
- bounded memory policy compatible with BullMQ;
- CloudWatch monitoring;
- no business-authority state stored exclusively in Redis.

Because Redis failure delays work but cannot destroy the PostgreSQL authority event, PR.2 may choose the smallest production-appropriate topology and scale it independently from PostgreSQL.

### S3 artifact binding

The production bucket must:

- have Block Public Access enabled;
- use TLS;
- use server-generated object keys;
- permit API-generated presigned PUT;
- retain object checksum/metadata required by seal validation;
- deny ordinary runtime deletion of sealed evidence-bearing artifacts;
- avoid lifecycle deletion rules that can remove a still-referenced sealed artifact;
- expose artifact bytes only to trusted application/verifier roles.

PostgreSQL remains authoritative for artifact identity, hash, media type, byte length, sealing state, submission relation, and evidence provenance.

### Dedicated verifier binding

The verifier is deliberately **not** deployed on Fargate because the locked architecture requires host-level `runsc` execution and hostile-workload controls.

Production verifier capacity uses dedicated Linux EC2 instance(s) in private subnets with:

- gVisor `runsc` installed and registered;
- pinned verifier runtime/rootfs digest;
- non-root learner process;
- read-only root filesystem;
- no network by default;
- no EC2 metadata path from learner execution;
- no AWS, DB, Redis, S3, OpenAI, or application credentials inside learner sandbox;
- CPU, memory, PID, wall-clock, filesystem and output limits;
- hidden verifier material available only on the trusted verification boundary;
- cleanup after every attempt;
- hostile-workload rehearsal before traffic enablement and after verifier-host changes.

The trusted dispatcher may access S3 to materialize the sealed learner artifact, but credentials are never inherited by the sandboxed learner process.

### Secrets / identity binding

AWS Secrets Manager owns secret values. ECS task roles and EC2 instance profiles provide workload identity. GitHub Actions production deployment uses OIDC federation into a narrowly-scoped IAM role.

At minimum Secrets Manager binds:

- database/auth database credentials or URLs;
- `BETTER_AUTH_SECRET`;
- Redis credentials/URL where required;
- verifier dispatcher token;
- S3 credentials only if IAM role-based access cannot be used;
- optional OpenAI API key.

No static AWS IAM access key is accepted as the normal CI/CD design.

### Domain convention

Until the operator supplies the owned production domain, the locked naming convention is:

- learner/instructor web: `https://app.<production-domain>`
- API/auth: `https://api.<production-domain>`

The concrete domain name is an **operator input for PR.2**, not a reason to reopen PR.1.

## Critical Review

### Alternative A — AWS Jakarta

Advantages:

- native S3 matches the existing AWS SDK/S3-compatible adapter without translation;
- RDS PostgreSQL 18 is available in Jakarta;
- ECS Fargate is available in Jakarta;
- ElastiCache and Secrets Manager are available in Jakarta;
- EC2 gives the host control required for gVisor/runsc;
- one provider can satisfy the trusted application plane and dedicated verifier plane.

Trade-offs:

- operational surface and cost are higher than a single-PaaS deployment;
- Jakarta is an opt-in AWS region and must be enabled on the account;
- NAT, Multi-AZ RDS and dedicated verifier capacity create a non-trivial fixed monthly cost.

### Alternative B — generic PaaS / serverless platform

Rejected for the production baseline because the dedicated gVisor verifier requirement would still require a separate Linux compute provider or a weaker sandbox contract, increasing architecture exceptions.

### Alternative C — another hyperscaler

Technically viable, but AWS requires the fewest adapter exceptions because object storage is already S3-oriented and the rest of the locked stack maps directly to managed AWS services plus EC2 verifier hosts.

## Revision

To avoid production overengineering while preserving safety:

1. ECS Fargate is used only for `web`, `api`, and `worker`; no Kubernetes/EKS is introduced.
2. Dedicated EC2 is reserved only for verifier isolation where host-level control is actually required.
3. Redis remains intentionally non-authoritative, so it can start with a modest production topology.
4. RDS receives the stronger availability/recovery posture because PostgreSQL is the system of record.
5. S3 uses the existing adapter and immutable/sealed artifact rules; no new storage abstraction is introduced.
6. Observability remains OpenTelemetry-first; AWS backend binding does not change application instrumentation.
7. Provider-specific tuning may change instance/task sizes without Change Review as long as the locked security, authority, RPO/RTO, isolation, and topology contracts continue to pass.

## Functional / Quality Gate

PR.1 passes only if the provider binding satisfies all of the following:

- [x] PostgreSQL 18 available in selected region.
- [x] managed Redis-compatible service available in selected region.
- [x] ECS Fargate available in selected region.
- [x] S3 native object storage available.
- [x] EC2 Linux capacity can host the required `runsc` verifier boundary.
- [x] external secret manager available.
- [x] no change to canonical competence authority.
- [x] no duplicate source of truth introduced.
- [x] Redis remains transport only.
- [x] verifier stays isolated from trusted application plane.
- [x] provider binding can be expressed through OpenTofu.
- [x] M12 production deployment contract remains satisfied.

Gate result: **PASS**.

## Final Review

The AWS Jakarta binding provides a concrete production target without changing any M0–M12 locked product or authority decision. It favors managed state, simple ECS application compute, native S3 storage, and a dedicated EC2 verifier boundary rather than introducing Kubernetes or a new distributed architecture.

Known operator inputs intentionally deferred to PR.2:

- AWS account ID / deployment role;
- production domain and Route 53 hosted-zone decision;
- exact VPC CIDRs and Availability Zones;
- exact ECS CPU/memory sizing;
- exact RDS/ElastiCache instance classes after budget check;
- alert destination and OTLP backend binding;
- OpenAI production key/model if AI Coach is enabled at launch.

These are environment parameters, not unresolved product architecture.

# PR.1 FINAL DECISION

**AWS Asia Pacific (Jakarta) `ap-southeast-3` is the LOCKED production provider/region binding for the MVP release.**

Any later provider or region change requires an explicit Production Change Review because it affects the locked release environment binding.

## External verification sources

Verified against current AWS documentation on 2026-09-13:

- AWS Regions: https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html
- ECS Fargate regions: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate-Regions.html
- RDS PostgreSQL Multi-AZ region/engine support: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.RDS_Fea_Regions_DB-eng.Feature.MultiAZDBClusters.html
- ElastiCache regions: https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/RegionsAndAZs.html
- Secrets Manager regional access: https://docs.aws.amazon.com/secretsmanager/latest/userguide/asm_access.html
