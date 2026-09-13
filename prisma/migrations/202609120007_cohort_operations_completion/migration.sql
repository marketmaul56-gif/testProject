-- M12.7 Cohort & Learning Operations completion.
-- Operational state never creates evidence or competence.

-- Close tenant-boundary gaps for cohort operational records.
ALTER TABLE cohort_memberships
  ADD CONSTRAINT cohort_memberships_cohort_same_tenant_fk
  FOREIGN KEY (tenant_id, cohort_id) REFERENCES cohorts(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE cohort_memberships
  ADD CONSTRAINT cohort_memberships_learner_same_tenant_fk
  FOREIGN KEY (tenant_id, learner_id) REFERENCES members(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE learning_assignments
  ADD CONSTRAINT learning_assignments_cohort_same_tenant_fk
  FOREIGN KEY (tenant_id, cohort_id) REFERENCES cohorts(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE learning_assignments
  ADD CONSTRAINT learning_assignments_course_same_tenant_fk
  FOREIGN KEY (tenant_id, course_version_id) REFERENCES course_versions(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE instructor_cohort_roles
  ADD CONSTRAINT instructor_cohort_roles_cohort_same_tenant_fk
  FOREIGN KEY (tenant_id, cohort_id) REFERENCES cohorts(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE instructor_cohort_roles
  ADD CONSTRAINT instructor_cohort_roles_instructor_same_tenant_fk
  FOREIGN KEY (tenant_id, instructor_id) REFERENCES members(tenant_id, id) ON DELETE RESTRICT;

-- MVP has exactly one primary published learning version per cohort. Secondary
-- assignments are intentionally out of scope.
ALTER TABLE learning_assignments
  ADD CONSTRAINT learning_assignments_mvp_primary_only CHECK (is_primary = true);

CREATE OR REPLACE FUNCTION enforce_learning_assignment_contract() RETURNS trigger AS $$
DECLARE
  target_cohort_status cohort_status;
  target_course_status learning_version_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO target_cohort_status
      FROM cohorts
     WHERE tenant_id = OLD.tenant_id AND id = OLD.cohort_id;
    IF target_cohort_status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'learning assignment is immutable after cohort activation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND
     (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.cohort_id IS DISTINCT FROM OLD.cohort_id) THEN
    RAISE EXCEPTION 'learning assignment cohort identity is immutable';
  END IF;

  SELECT status INTO target_cohort_status
    FROM cohorts
   WHERE tenant_id = NEW.tenant_id AND id = NEW.cohort_id;
  IF target_cohort_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'learning assignment may only be configured while cohort is DRAFT';
  END IF;
  IF NEW.is_primary IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'MVP supports only the primary learning assignment';
  END IF;

  SELECT status INTO target_course_status
    FROM course_versions
   WHERE tenant_id = NEW.tenant_id AND id = NEW.course_version_id;
  IF target_course_status IS DISTINCT FROM 'PUBLISHED' THEN
    RAISE EXCEPTION 'cohort primary assignment requires a published immutable learning version';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER learning_assignments_contract_guard
BEFORE INSERT OR UPDATE OR DELETE ON learning_assignments
FOR EACH ROW EXECUTE FUNCTION enforce_learning_assignment_contract();

CREATE OR REPLACE FUNCTION enforce_cohort_lifecycle_contract() RETURNS trigger AS $$
DECLARE
  primary_count integer;
  published_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'DRAFT' OR NEW.version IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'new cohort must start in DRAFT at version 0';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'cohort identity is immutable';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'cohort update requires exactly one optimistic-lock version increment';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'DRAFT' AND NEW.status IN ('ACTIVE', 'ARCHIVED')) OR
      (OLD.status = 'ACTIVE' AND NEW.status = 'COMPLETED') OR
      (OLD.status = 'COMPLETED' AND NEW.status = 'ARCHIVED')
    ) THEN
      RAISE EXCEPTION 'invalid cohort lifecycle transition: % -> %', OLD.status, NEW.status;
    END IF;

    IF OLD.status = 'DRAFT' AND NEW.status = 'ACTIVE' THEN
      SELECT count(*)::integer,
             count(*) FILTER (WHERE cv.status = 'PUBLISHED')::integer
        INTO primary_count, published_count
        FROM learning_assignments assignment
        JOIN course_versions cv
          ON cv.tenant_id = assignment.tenant_id
         AND cv.id = assignment.course_version_id
       WHERE assignment.tenant_id = OLD.tenant_id
         AND assignment.cohort_id = OLD.id
         AND assignment.is_primary = true;
      IF primary_count <> 1 OR published_count <> 1 THEN
        RAISE EXCEPTION 'cohort activation requires exactly one primary published learning assignment';
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cohorts_lifecycle_contract_guard
BEFORE INSERT OR UPDATE ON cohorts
FOR EACH ROW EXECUTE FUNCTION enforce_cohort_lifecycle_contract();

CREATE OR REPLACE FUNCTION enforce_membership_history_contract() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'ENROLLED' OR NEW.removed_at IS NOT NULL THEN
      RAISE EXCEPTION 'new cohort membership must start ENROLLED';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'cohort membership history cannot be deleted';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
     NEW.id IS DISTINCT FROM OLD.id OR
     NEW.cohort_id IS DISTINCT FROM OLD.cohort_id OR
     NEW.learner_id IS DISTINCT FROM OLD.learner_id OR
     NEW.enrolled_at IS DISTINCT FROM OLD.enrolled_at THEN
    RAISE EXCEPTION 'cohort membership occurrence identity is immutable';
  END IF;

  IF OLD.status IS DISTINCT FROM 'ENROLLED' OR NEW.status IS DISTINCT FROM 'REMOVED' OR NEW.removed_at IS NULL THEN
    RAISE EXCEPTION 'membership transition must be ENROLLED -> REMOVED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cohort_memberships_history_guard
BEFORE INSERT OR UPDATE OR DELETE ON cohort_memberships
FOR EACH ROW EXECUTE FUNCTION enforce_membership_history_contract();

COMMENT ON TABLE cohorts IS 'Operational cohort lifecycle only. Cohort completion never implies competence.';
COMMENT ON TABLE cohort_memberships IS 'Historical enrollment occurrences; re-enrollment creates a new row.';
COMMENT ON TABLE learning_assignments IS 'MVP one primary published learning version per cohort, immutable after ACTIVE.';
