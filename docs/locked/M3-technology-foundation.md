# M3 — Detailed Technical Architecture & Technology Foundation 🔒 LOCKED

**Recovery status:** Canonical recovery from the original LOCKED M0–M3 handoff artifact.
**Governance:** This file does not introduce new architecture. Any change requires explicit Change Review.

## M3.1 — Technology Evaluation & Stack Decision

| Concern | LOCKED Decision |
|---|---|
| Primary language | TypeScript |
| Runtime | Node.js 24 LTS |
| Backend | NestJS 12 |
| HTTP platform | Express |
| Frontend | Next.js 16 + React |
| Transactional DB | PostgreSQL 18 |
| Persistence | Prisma ORM 7 |
| Authentication | Better Auth current stable |
| Auth ownership | NestJS/API boundary |
| Auth session source of truth | PostgreSQL |
| Authorization | Application-owned policy module |
| Background jobs | BullMQ |
| Queue infrastructure | Redis |
| Object storage | S3-compatible |
| Verification isolation | gVisor/runsc |
| AI API | OpenAI Responses API |
| AI architecture | Thin provider adapter |
| Observability | OpenTelemetry-first |
| Deployment | OCI containers + managed state + dedicated verifier nodes |
| Repository | pnpm workspace monorepo |
| Kubernetes | Deferred |
| Temporal | Deferred |
| OpenFGA | Deferred |
| Firecracker | Conditional future hardening |

### CR-M3.1-AUTH-001

Production `platform_admin` requires TOTP 2FA + backup codes. No trusted-device bypass initially. Better Auth topology remains unchanged.

## M3.2 — Application Architecture & Module Decomposition

Architectural style:

> Modular monolith for trusted application logic; isolated runtime for untrusted learner execution.

Canonical repository direction:

```text
/
├── apps/
│   ├── web/
│   ├── api/
│   ├── worker/
│   └── verifier-dispatcher/
├── packages/
│   ├── modules/
│   │   ├── identity/
│   │   ├── learning/
│   │   ├── enrollment/
│   │   ├── cohorts/
│   │   ├── practice/
│   │   ├── verification/
│   │   ├── projects/
│   │   ├── competency/
│   │   ├── ai-coaching/
│   │   └── notifications/
│   ├── platform/
│   │   ├── auth/
│   │   ├── db/
│   │   ├── queue/
│   │   ├── storage/
│   │   ├── observability/
│   │   ├── config/
│   │   └── audit/
│   ├── contracts/
│   ├── shared-kernel/
│   ├── testing/
│   └── ui/
├── prisma/
├── infra/
└── docs/
```

Forbidden dependencies:

```text
apps/web → platform/db
apps/web → module infrastructure
apps/web → Prisma
domain → NestJS
domain → Prisma
domain → BullMQ
domain → OpenAI SDK
module A → module B/internal
module A → module B/infrastructure
```

Allowed:

```text
apps/web → contracts
apps/web → API client
module A → module B public application surface
```

Circular module dependencies are prohibited.

## M3.3 — Domain & Data Architecture

- One PostgreSQL database for trusted MVP transactional state.
- Logical ownership per module.
- Exactly one writer-owner per table.
- Controlled cross-module foreign keys.
- No cross-module `ON DELETE CASCADE`.
- Cross-module writes prohibited.
- Application aggregate IDs use UUIDv7.
- Transactional Outbox is LOCKED for reliable events.

Primary module ownership:

| Module | Owned state |
|---|---|
| Identity | Member/profile |
| Learning | Course, Chapter, Lesson |
| Enrollment | Enrollment, LessonProgress |
| Cohorts | Cohort, CohortMembership, assignments |
| Practice | PracticeDefinition, PracticeSubmission |
| Verification | VerificationAttempt, VerificationResult |
| Projects | ProjectDefinition, ProjectSubmission, ProjectReview |
| Competency | Skill, SkillAlignment, Evidence, CompetencyState |
| AI Coaching | CoachingSession, CoachingInteraction |
| Notifications | NotificationIntent, NotificationDelivery |
| Platform Audit | AuditEvent |

Critical invariants:

```text
completion != competence
AI feedback != verified evidence
verification result != competency state
submission != evidence until qualification
course publication != enrollment
auth user != domain permission
```

## M3.4 — API & Contract Architecture

```text
Protocol       → HTTP + JSON
Style          → Resource-oriented REST + explicit domain actions
Namespace      → /api/v1
Auth namespace → /api/auth
Wire schema    → Zod 4
Validation     → Standard Schema validation
Documentation  → Generated OpenAPI
Errors         → RFC 9457 Problem Details
Pagination     → Opaque cursor
Concurrency    → ETag / If-Match
Idempotency    → Operation-specific MVP strategy
Async actions  → 202 + operation/domain resource
File uploads   → Presigned object-storage flow
```

Rules:

- Prisma models are never exposed directly.
- Transport DTO != domain entity.
- GET must not mutate state.
- Controllers contain no business logic.
- Client identity/role fields are never trusted.
- Generic idempotency infrastructure is not introduced without Change Review.

## M3.5 — Authentication & Authorization

Authentication authority:

```text
Browser
  ↓
NestJS / Express
  ↓
Better Auth
  ↓
PostgreSQL
```

Application principal is separate from Better Auth session implementation.

Authorization model:

> capability + resource relationship + resource state

Default: deny by default.

Examples:

- author edits only owned course unless platform_admin;
- instructor manages only related cohorts/resources;
- learner views own data;
- platform_admin still passes through policy + audit;
- system actors use explicit `SystemPrincipal`.

## M3.6 — Async Processing & Event Architecture

Delivery semantics: **at-least-once**. Exactly-once is not claimed.

Correctness path:

```text
PostgreSQL outbox
→ BullMQ / Redis
→ idempotent consumer
```

Initial queues:

```text
integration-events
verification
ai-coaching
notifications
maintenance
```

BullMQ deduplication may be used as an optimization only; it is not the correctness mechanism. State-critical consumers must be duplicate-safe.

## M3.7 — Verification Runtime Architecture

Learner code is hostile/untrusted.

```text
Trusted Application Plane
        ↓
Verification Dispatcher
        ↓
================================================
Verification Security Boundary
================================================
Dedicated Verifier Node
        ↓
gVisor / runsc
        ↓
Ephemeral Sandbox
```

Mandatory controls:

- no production credentials;
- network disabled by default;
- immutable/pinned runtime image digest;
- non-root execution;
- readonly base runtime;
- ephemeral workspace;
- CPU, memory, PID, wall-clock, output and filesystem limits;
- sandbox destroyed after execution.

Required security tests: infinite loop, memory bomb, process bomb, internet/private network denial, metadata denial, credential discovery, filesystem escape, excessive stdout, cleanup, malicious workload host health, hidden-test probing.

Firecracker remains conditional future hardening only.

## M3.8 — AI Architecture

AI roles: hint, diagnosis, feedback, Socratic questioning, explanation, rubric assistance.

AI cannot grant competence, create verified evidence directly, or replace deterministic verification.

```text
Learning / Practice / Projects
        ↓
AI Coaching Service
        ↓
Context Assembler
        ↓
Prompt Policy / Version
        ↓
AI Provider Interface
        ↓
OpenAI Responses Adapter
```

Decisions:

- specific model ID is not locked;
- logical model profiles;
- prompts versioned;
- structured outputs validated;
- learner content treated as untrusted context;
- no write-capable autonomous AI tools in MVP;
- provider request `store: false` by default;
- context minimization mandatory;
- AI failures must not block learning, practice, verification, project submission, or competency evidence;
- prompt/model changes require evaluation/regression gate.

## M3.9 — Infrastructure, Deployment & Observability

Environment classes: local, CI/test, staging, production.

Production topology:

```text
Internet
   ↓
Edge / TLS
   ↓
Next.js Web + NestJS API
   ↓
PostgreSQL / Redis / Object Storage
   ↓
Trusted Workers
   ↓
Verification Dispatcher
   ↓
Dedicated Verifier Infrastructure
```

Infrastructure as Code: **OpenTofu stable**.

Production principles:

- immutable OCI images;
- managed stateful services preferred;
- private networking for PostgreSQL/Redis;
- no production secrets in Git;
- secrets externalized;
- production deploy only through controlled CD pipeline;
- remote encrypted IaC state with locking.

Observability:

```text
OpenTelemetry → traces
OpenTelemetry → metrics
structured JSON logging → logs
```

Correlation propagates across HTTP → application → DB/outbox → BullMQ → worker → AI/verifier.

Initial engineering recovery targets: PostgreSQL RPO ≤ 15 minutes; RTO ≤ 4 hours. These are engineering targets, not contractual SLA.

## M3.10 — Architecture Integration Review

Canonical competence path:

```text
Structured Learning
      ↓
Authentic Practice / Project
      ↓
Submission
      ↓
Verification / Review
      ↓
Qualified Evidence
      ↓
Competency State
```

AI coaching operates alongside the journey and does not enter the authoritative evidence path.

## Deferred by Design

Kubernetes, microservices, Kafka, Temporal, OpenFGA, Firecracker, Elasticsearch, event sourcing, generalized CQRS framework, multi-region, separate analytics warehouse, specific cloud vendor, specific observability backend, specific AI model ID.

## Recovery Evidence

- Source artifact: `AI-Native-Skill-Learning-Platform_M0-M3_LOCKED_Context.md`
- Original status: M3.1–M3.10 and M3 overall 🔒 LOCKED
- Recovery date: 2026-09-12
- Recovery action: Canonicalized for M12 implementation baseline
- Ambiguities requiring Change Review: none identified in recovered M3 decisions
