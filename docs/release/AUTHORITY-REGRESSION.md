# Mandatory Authority Regression

All items below are release blocking.

## Forbidden authority paths

```text
Lesson Completion ─X→ Evidence
Practice Completion ─X→ Competence
Project Completion ─X→ Competence
Cohort Completion ─X→ Competence
Instructor Guidance ─X→ Evidence
Admin Privilege ─X→ Competence
AI Coach ─X→ Evidence
```

## Only valid competence authority path

```text
Artifact
→ Submission
→ Authoritative Verification
→ Evidence
→ Deterministic Competency Projection
```

## Required regression assertions

- Completion cannot create evidence.
- AI cannot create evidence.
- Instructor cannot create evidence.
- Admin privilege cannot directly create competence.
- Verifier unavailable does not produce learner FAIL.
- Evidence write failure does not become skill-absent evidence.
- Duplicate verification retry does not duplicate evidence.
- Competency projection is derived/read-only.
- No alternate evidence engine exists.
