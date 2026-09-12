-- M12.3 Security audit integrity.
-- Security audit records are append-only evidence of privileged/auth boundary events.

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

COMMENT ON TABLE audit_events IS 'Append-only security and authority audit events. Not a source of competence authority.';
