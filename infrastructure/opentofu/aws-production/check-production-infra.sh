#!/usr/bin/env bash
set -euo pipefail

ROOT="infrastructure/opentofu/aws-production"

require() {
  local pattern="$1"
  local file="$2"
  if ! grep -Eq "$pattern" "$ROOT/$file"; then
    echo "missing required production-infra contract: $pattern in $file" >&2
    exit 1
  fi
}

require 'publicly_accessible[[:space:]]*=[[:space:]]*false' 'data.tf'
require 'deletion_protection[[:space:]]*=[[:space:]]*true' 'data.tf'
require 'storage_encrypted[[:space:]]*=[[:space:]]*true' 'data.tf'
require 'multi_az[[:space:]]*=[[:space:]]*true' 'data.tf'
require 'transit_encryption_enabled[[:space:]]*=[[:space:]]*true' 'data.tf'
require 'at_rest_encryption_enabled[[:space:]]*=[[:space:]]*true' 'data.tf'
require 'block_public_acls[[:space:]]*=[[:space:]]*true' 'data.tf'
require 'restrict_public_buckets[[:space:]]*=[[:space:]]*true' 'data.tf'
require 'aws:SecureTransport' 'data.tf'
require 'image_tag_mutability[[:space:]]*=[[:space:]]*"IMMUTABLE"' 'compute.tf'
require 'http_tokens[[:space:]]*=[[:space:]]*"required"' 'verifier.tf'
require 'associate_public_ip_address[[:space:]]*=[[:space:]]*false' 'verifier.tf'
require 'target_group_arns[[:space:]]*=' 'verifier.tf'
require 'latest_version' 'verifier.tf'
require 'sha512sum --check --strict' 'templates/verifier-user-data.sh.tftpl'
require 'VERIFIER_HOST_READY=1' 'templates/verifier-user-data.sh.tftpl'
require 'token.actions.githubusercontent.com:aud' 'ci-federation.tf'
require 'token.actions.githubusercontent.com:sub' 'ci-federation.tf'
require 'repo:marketmaul56-gif@326277591/testProject@1360769907:ref:refs/heads/main' 'variables.tf'
require 'iam:PassedToService' 'ci-federation.tf'

if grep -Eq 'ignore_changes[[:space:]]*=[[:space:]]*\[[^]]*desired_capacity' "$ROOT/verifier.tf"; then
  echo "verifier desired capacity must remain declarative for PR.3 activation" >&2
  exit 1
fi

if grep -R -E 'AKIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|aws_secret_access_key[[:space:]]*=' "$ROOT" --exclude='check-production-infra.sh'; then
  echo "possible static cloud credential/private key found in production infrastructure" >&2
  exit 1
fi

echo "PR.2 production infrastructure security assertions: PASS"
