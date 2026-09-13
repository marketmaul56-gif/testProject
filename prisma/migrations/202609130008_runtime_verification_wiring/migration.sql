-- M12.9 bounded runtime-wiring amendment approved by Change Review.
-- This adds immutable server-owned verifier configuration and idempotency guards;
-- it does not create a new competence/evidence authority.

CREATE TABLE verification_profiles (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  target_type text NOT NULL CHECK (target_type IN ('PRACTICE_REVISION', 'PROJECT_DEFINITION')),
  target_id uuid NOT NULL,
  verifier_key text NOT NULL CHECK (length(verifier_key) BETWEEN 1 AND 100),
  verifier_version text NOT NULL CHECK (length(verifier_version) BETWEEN 1 AND 100),
  hidden_test_bundle_ref text NOT NULL CHECK (length(hidden_test_bundle_ref) BETWEEN 1 AND 2048),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, target_type, target_id)
);
CREATE INDEX verification_profiles_tenant_target_idx ON verification_profiles (tenant_id, target_type, target_id);

CREATE OR REPLACE FUNCTION verification_profile_target_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.target_type = 'PRACTICE_REVISION' THEN
    IF NOT EXISTS (SELECT 1 FROM practice_revisions r WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.target_id) THEN
      RAISE EXCEPTION 'verification profile practice target must exist in same tenant';
    END IF;
  ELSIF NEW.target_type = 'PROJECT_DEFINITION' THEN
    IF NOT EXISTS (SELECT 1 FROM project_definitions p WHERE p.tenant_id=NEW.tenant_id AND p.id=NEW.target_id) THEN
      RAISE EXCEPTION 'verification profile project target must exist in same tenant';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER verification_profiles_target_guard
BEFORE INSERT OR UPDATE ON verification_profiles
FOR EACH ROW EXECUTE FUNCTION verification_profile_target_guard();
CREATE TRIGGER verification_profiles_append_only
BEFORE UPDATE OR DELETE ON verification_profiles
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE UNIQUE INDEX practice_submissions_tenant_learner_request_key
  ON practice_submissions (tenant_id, learner_id, request_id);
CREATE UNIQUE INDEX project_submissions_tenant_learner_request_key
  ON project_submissions (tenant_id, learner_id, request_id);
CREATE UNIQUE INDEX outbox_verification_requested_once_idx
  ON outbox_events (tenant_id, aggregate_type, aggregate_id, event_type)
  WHERE event_type='verification.requested';
CREATE INDEX outbox_runtime_delivery_idx
  ON outbox_events (event_type, published_at, attempt_count, occurred_at);

COMMENT ON TABLE verification_profiles IS 'Immutable server-owned verifier configuration; never client authority.';
COMMENT ON INDEX outbox_verification_requested_once_idx IS 'One canonical verification request event per immutable learner submission.';
