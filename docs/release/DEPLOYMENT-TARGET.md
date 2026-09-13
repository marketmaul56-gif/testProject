# Production Deployment Target Contract — MVP

Status: **M12.9 provider-neutral production target**

This contract closes the deploy-target ambiguity without selecting a cloud vendor that M3 intentionally deferred. Any production environment is conformant only if it satisfies every requirement below. Provider-specific bindings belong in environment-specific OpenTofu configuration and must not alter application authority semantics.

## Runtime topology

Production traffic follows this logical topology:

`Internet → Edge/TLS → Next.js Web + NestJS API → managed PostgreSQL / managed Redis / S3-compatible Object Storage → trusted Worker → Verification Dispatcher → dedicated gVisor/runsc verifier nodes`.

AI Coaching calls the configured OpenAI provider from the trusted application plane and remains optional/formative.

Required deployable OCI services:

- `web` — Next.js standalone runtime;
- `api` — NestJS/Express + Better Auth boundary;
- `worker` — BullMQ/Redis delivery consumer backed by PostgreSQL outbox authority;
- `verifier-dispatcher` — trusted dispatcher only, deployed on/adjacent to dedicated verifier capacity and executing learner code through `runsc`.

Application services run from immutable OCI digests. Rebuilding an old release is not rollback.

## Managed state contract

### PostgreSQL 18

PostgreSQL is the system of record for trusted MVP state, including authentication sessions, domain records, transactional outbox, verification results, skill evidence, competency projections, and audit events.

Production PostgreSQL must provide:

- PostgreSQL 18 compatibility;
- encrypted storage and encrypted transport;
- private network reachability from trusted application runtimes;
- automated backups/PITR configured to engineering target **RPO ≤ 15 minutes**;
- recovery procedure capable of engineering target **RTO ≤ 4 hours**;
- monitoring for connection saturation, storage pressure, replication/backup failure, and availability;
- no manual schema mutation outside version-controlled migrations.

### Redis

Redis is BullMQ transport only and is never the source of truth for verification/evidence correctness. A Redis outage may delay work but must not lose the canonical PostgreSQL outbox event.

Required properties:

- private authenticated endpoint;
- encrypted transport where supported by the selected provider;
- bounded memory policy appropriate to BullMQ;
- availability monitoring;
- no evidence, competency, or verifier authority persisted solely in Redis.

### S3-compatible object storage

Object storage contains project artifact bytes; PostgreSQL stores artifact revision identity, object key, content hash, media type, length, sealing state, and provenance.

Required properties:

- S3 API compatibility required by the platform adapter;
- server-generated object keys;
- TLS in non-local environments;
- private credentials supplied only to trusted API/verifier processes;
- presigned PUT support;
- `HEAD` metadata/checksum validation before revision sealing;
- retention/lifecycle policy that cannot delete a sealed artifact still referenced by immutable submissions/evidence;
- no public bucket access by default.

## Dedicated verifier target

Learner code is hostile. Verifier capacity must be isolated from the normal trusted application plane and must support the locked gVisor/runsc boundary.

Mandatory runtime controls:

- `runsc` registered and exercised;
- pinned verifier runtime image digest;
- non-root user;
- read-only root filesystem;
- explicit ephemeral workspace;
- network disabled by default, including metadata/private endpoint denial;
- no production DB, Redis, object-storage, AI, cloud, or app credentials in learner execution;
- CPU, memory, PID, wall-clock, filesystem, and output limits;
- hidden verifier material mounted only on the trusted verification input surface;
- cleanup after every attempt;
- hostile-workload rehearsal before production promotion and after material verifier-host changes.

## Edge and network

The selected environment must terminate TLS before user traffic reaches web/API. Database, Redis, storage-control paths, and verifier control endpoints must not be internet-public unless a provider requires a managed public endpoint protected by equivalent network/auth controls.

The verifier dispatcher control API requires its server-only bearer token and must not be exposed as a learner/browser API.

## Secrets

Real credentials never live in Git or baked OCI layers. The selected environment must provide an external secret mechanism capable of injecting at least:

- `DATABASE_URL`;
- `AUTH_DATABASE_URL`;
- `BETTER_AUTH_SECRET`;
- Redis credentials/URL;
- S3 credentials when workload identity is unavailable;
- verifier dispatcher token;
- optional OpenAI API key.

Production `platform_admin` access retains the locked TOTP 2FA + backup-code requirement.

## Production configuration

At minimum, deployment must bind:

- `NODE_ENV=production`;
- API/web origins and trusted origins;
- PostgreSQL/auth database URLs;
- Redis URL for worker;
- S3 endpoint/region/bucket/path-style/credentials as required by provider;
- verifier dispatcher URL/token and verifier runtime digest/rootfs/hidden-test roots;
- optional OTLP endpoint/timeout;
- optional OpenAI key/model.

Application production config must fail closed when required storage/auth settings are missing.

## Observability and alert contract

OpenTelemetry traces and metrics are exported through OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is configured. Backend vendor is deliberately not selected here.

The production telemetry backend must support alerting for at least:

- API readiness failures and elevated 5xx rate;
- PostgreSQL availability/connection/storage pressure;
- Redis/BullMQ delivery failures/backlog growth;
- verifier infrastructure `ERROR` rate, timeout, resource-limit events, and dispatcher unavailability;
- object-storage failures during upload validation/resolution;
- authority-delivery retry growth;
- backup/PITR failures.

Telemetry must not contain passwords, tokens, auth headers, raw learner artifacts, raw AI prompts/responses, hidden tests, or verifier secrets.

## Build, promotion and rollback

1. Build once from the locked source commit and frozen dependency graph.
2. Record immutable OCI digests for web/API/worker/verifier-dispatcher.
3. Run the M12 CI, Redis transport, S3 integration, gVisor hostile rehearsal, OCI smoke, migration, and recovery gates on the release source SHA.
4. Create a release candidate only when all mandatory gates are PASS and blockers are `NONE`.
5. Apply version-controlled migrations before/with traffic shift according to expand → migrate → verify → contract when needed.
6. Promote the same immutable OCI digests to production; do not rebuild between environments.
7. Roll back application code by promoting the previous known-good digest. Database rollback is a separate recovery decision and must be data-preserving.

## Infrastructure as Code binding

OpenTofu remains the locked IaC tool. This repository intentionally does not invent AWS/GCP/Azure/other provider resources before an operator selects the deployment provider/account/region. The provider binding must implement this contract rather than redefine it.

Provider selection is therefore an **environment binding**, not a missing product/architecture decision and not permission to change M0–M12 authority semantics.

## Production acceptance evidence

Before first live deployment, the environment operator records:

- provider/account/project/region binding;
- OpenTofu plan/apply evidence;
- immutable OCI digests;
- secret-manager/workload-identity binding;
- PostgreSQL PITR/backup settings and restore rehearsal;
- Redis and object-storage endpoints/policies;
- verifier-node `runsc` rehearsal evidence;
- OTLP/alert backend binding and alert test;
- release operator, timestamp, rollback digest, and smoke-test result.

Those environment-specific values are intentionally outside this provider-neutral locked application baseline.
