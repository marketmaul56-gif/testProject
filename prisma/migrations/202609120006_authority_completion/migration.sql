-- M12.6 Verification → Evidence → Competency authority completion.
-- This migration strengthens the existing canonical authority chain; it does not
-- introduce a second evidence or competency source of truth.

-- Verification invocation retry identity is server-owned and tenant scoped.
ALTER TABLE verification_attempts ADD COLUMN request_id text;
UPDATE verification_attempts SET request_id = id::text WHERE request_id IS NULL;
ALTER TABLE verification_attempts ALTER COLUMN request_id SET NOT NULL;
CREATE UNIQUE INDEX verification_attempts_tenant_request_id_key
  ON verification_attempts (tenant_id, request_id);

-- Competency-owned skill alignment for project proof. Learning navigation
-- alignment remains a separate concern in project_learning_alignments.
CREATE TABLE project_skill_alignments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  project_definition_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, project_definition_id, skill_id),
  CONSTRAINT project_skill_alignment_project_same_tenant_fk
    FOREIGN KEY (tenant_id, project_definition_id)
    REFERENCES project_definitions(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT project_skill_alignment_skill_same_tenant_fk
    FOREIGN KEY (tenant_id, skill_id)
    REFERENCES skills(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX project_skill_alignments_skill_idx
  ON project_skill_alignments (tenant_id, skill_id, project_definition_id);

-- A verification result must refer to the learner who owns the immutable
-- submitted source and to an attempt that has reached COMPLETED.
CREATE OR REPLACE FUNCTION enforce_verification_result_provenance() RETURNS trigger AS $$
DECLARE
  source_tenant uuid;
  source_learner uuid;
  attempt_status verification_attempt_status;
BEGIN
  SELECT va.tenant_id,
         va.status,
         COALESCE(practice.learner_id, project.learner_id)
    INTO source_tenant, attempt_status, source_learner
    FROM verification_attempts va
    LEFT JOIN practice_submissions practice ON practice.id = va.practice_submission_id
    LEFT JOIN project_submissions project ON project.id = va.project_submission_id
   WHERE va.id = NEW.verification_attempt_id;

  IF source_tenant IS NULL THEN
    RAISE EXCEPTION 'verification result requires an existing attempt';
  END IF;
  IF source_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'verification result tenant must match attempt tenant';
  END IF;
  IF source_learner IS DISTINCT FROM NEW.learner_id THEN
    RAISE EXCEPTION 'verification result learner must match submitted source owner';
  END IF;
  IF attempt_status IS DISTINCT FROM 'COMPLETED' THEN
    RAISE EXCEPTION 'verification result requires COMPLETED attempt';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER verification_result_provenance_guard
BEFORE INSERT ON verification_results
FOR EACH ROW EXECUTE FUNCTION enforce_verification_result_provenance();

-- Replace the original PASSED-only evidence check with complete canonical
-- provenance validation: same tenant + same learner + aligned skill + PASSED.
CREATE OR REPLACE FUNCTION enforce_evidence_from_passed_verification() RETURNS trigger AS $$
DECLARE
  result_outcome verification_outcome;
  result_tenant uuid;
  result_learner uuid;
  practice_submission uuid;
  project_submission uuid;
  practice_skill uuid;
BEGIN
  SELECT vr.outcome,
         vr.tenant_id,
         vr.learner_id,
         va.practice_submission_id,
         va.project_submission_id
    INTO result_outcome, result_tenant, result_learner, practice_submission, project_submission
    FROM verification_results vr
    JOIN verification_attempts va ON va.id = vr.verification_attempt_id
   WHERE vr.id = NEW.verification_result_id;

  IF result_outcome IS DISTINCT FROM 'PASSED' THEN
    RAISE EXCEPTION 'skill evidence requires PASSED authoritative verification';
  END IF;
  IF result_tenant IS DISTINCT FROM NEW.tenant_id OR result_learner IS DISTINCT FROM NEW.learner_id THEN
    RAISE EXCEPTION 'skill evidence provenance must match verification tenant and learner';
  END IF;

  IF practice_submission IS NOT NULL THEN
    SELECT revision.skill_id
      INTO practice_skill
      FROM practice_submissions submission
      JOIN practice_revisions revision ON revision.id = submission.practice_revision_id
     WHERE submission.id = practice_submission;
    IF practice_skill IS DISTINCT FROM NEW.skill_id THEN
      RAISE EXCEPTION 'practice evidence skill must match immutable practice revision skill';
    END IF;
  ELSIF project_submission IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM project_submissions submission
        JOIN artifact_revisions revision ON revision.id = submission.artifact_revision_id
        JOIN project_artifacts artifact ON artifact.id = revision.artifact_id
        JOIN project_skill_alignments alignment
          ON alignment.tenant_id = submission.tenant_id
         AND alignment.project_definition_id = artifact.project_definition_id
         AND alignment.skill_id = NEW.skill_id
       WHERE submission.id = project_submission
         AND submission.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'project evidence skill must be explicitly aligned to submitted project';
    END IF;
  ELSE
    RAISE EXCEPTION 'verification result lacks canonical submitted source';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- CompetencyState remains a derived read model. Any write must equal the
-- evidence-derived truth at the moment of mutation.
CREATE OR REPLACE FUNCTION enforce_competency_projection_integrity() RETURNS trigger AS $$
DECLARE
  target_tenant uuid;
  target_learner uuid;
  target_skill uuid;
  expected_count integer;
  expected_status competency_projection_status;
BEGIN
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  target_learner := COALESCE(NEW.learner_id, OLD.learner_id);
  target_skill := COALESCE(NEW.skill_id, OLD.skill_id);

  SELECT count(*)::integer
    INTO expected_count
    FROM skill_evidence
   WHERE tenant_id = target_tenant
     AND learner_id = target_learner
     AND skill_id = target_skill;
  expected_status := CASE WHEN expected_count > 0 THEN 'EVIDENCED'::competency_projection_status
                          ELSE 'NOT_YET_EVIDENCED'::competency_projection_status END;

  IF TG_OP = 'DELETE' THEN
    IF expected_count > 0 THEN
      RAISE EXCEPTION 'cannot delete competency projection while canonical evidence exists';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.evidence_count IS DISTINCT FROM expected_count OR NEW.status IS DISTINCT FROM expected_status THEN
    RAISE EXCEPTION 'competency projection must be derived deterministically from canonical evidence';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER competency_projection_integrity_guard
BEFORE INSERT OR UPDATE OR DELETE ON competency_states
FOR EACH ROW EXECUTE FUNCTION enforce_competency_projection_integrity();

COMMENT ON TABLE project_skill_alignments IS 'Competency-owned alignment used only to qualify project evidence; never evidence itself.';
COMMENT ON COLUMN verification_attempts.request_id IS 'Tenant-scoped idempotency identity for verification invocation retries.';
