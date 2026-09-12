# Test Suite

The eventual test suite must cover, at minimum:

- unit/domain
- persistence
- authorization (including negative tests)
- integration
- end-to-end learner flow
- end-to-end instructor flow
- authority regression
- failure/retry/idempotency
- migration
- backup/restore verification
- security regression
- performance baseline

Canonical rule: system/infrastructure failure must never become learner FAIL.
