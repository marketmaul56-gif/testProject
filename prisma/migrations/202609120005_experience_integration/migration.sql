-- M12.4 Learner & Instructor Experience integration.
-- These tables support navigation/read-model composition and formative guidance only.
-- Neither table participates in the competence authority chain.

CREATE TABLE project_learning_alignments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  course_version_id uuid NOT NULL,
  project_definition_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, course_version_id, project_definition_id),
  UNIQUE (tenant_id, course_version_id, position),
  CONSTRAINT project_learning_alignment_course_same_tenant_fk
    FOREIGN KEY (tenant_id, course_version_id) REFERENCES course_versions(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT project_learning_alignment_project_same_tenant_fk
    FOREIGN KEY (tenant_id, project_definition_id) REFERENCES project_definitions(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX project_learning_alignments_course_idx
  ON project_learning_alignments (tenant_id, course_version_id, position);

CREATE TABLE instructor_guidance (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  cohort_id uuid NOT NULL,
  instructor_id uuid NOT NULL,
  learner_id uuid NOT NULL,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id, id),
  CONSTRAINT instructor_guidance_cohort_same_tenant_fk
    FOREIGN KEY (tenant_id, cohort_id) REFERENCES cohorts(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT instructor_guidance_instructor_same_tenant_fk
    FOREIGN KEY (tenant_id, instructor_id) REFERENCES members(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT instructor_guidance_learner_same_tenant_fk
    FOREIGN KEY (tenant_id, learner_id) REFERENCES members(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX instructor_guidance_learner_idx
  ON instructor_guidance (tenant_id, cohort_id, learner_id, created_at DESC);

CREATE TRIGGER instructor_guidance_append_only
BEFORE UPDATE OR DELETE ON instructor_guidance
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

COMMENT ON TABLE project_learning_alignments IS 'Navigation alignment between published learning versions and projects; never competence authority.';
COMMENT ON TABLE instructor_guidance IS 'Formative instructor guidance only; cannot create evidence or competency.';
