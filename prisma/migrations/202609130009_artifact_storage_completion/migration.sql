ALTER TABLE artifact_revisions
  ADD COLUMN content_type text,
  ADD COLUMN content_length bigint;

ALTER TABLE artifact_revisions
  ADD CONSTRAINT artifact_revisions_content_length_positive
  CHECK (content_length IS NULL OR content_length > 0);

COMMENT ON COLUMN artifact_revisions.content_type IS
  'Media type signed into the presigned upload request. Required for production object-storage revisions.';
COMMENT ON COLUMN artifact_revisions.content_length IS
  'Expected immutable upload length. Object storage is verified before a revision is sealed.';
