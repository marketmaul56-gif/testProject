project_name = "skill-platform-ci"
environment  = "production"
aws_region   = "ap-southeast-3"

availability_zones = ["ap-southeast-3a", "ap-southeast-3b"]
vpc_cidr            = "10.44.0.0/16"

artifact_bucket_name = "skill-platform-ci-validation-example"
artifact_cors_allowed_origins = ["https://example.invalid"]

acm_certificate_arn = null

postgres_engine_version = "18"
rds_instance_class      = "db.t4g.medium"
redis_engine_version    = "7.1"
redis_node_type         = "cache.t4g.small"
redis_auth_token        = "01234567890123456789012345678901"

verifier_ami_id            = "ami-00000000000000000"
verifier_instance_type     = "m6i.large"
verifier_desired_capacity  = 0
runsc_download_url          = "https://example.invalid/runsc"
runsc_sha512                = "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"

offline_validation = true
