variable "project_name" {
  type    = string
  default = "skill-platform"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "aws_region" {
  type    = string
  default = "ap-southeast-3"

  validation {
    condition     = var.aws_region == "ap-southeast-3"
    error_message = "PR.1 locks production to AWS Asia Pacific (Jakarta), ap-southeast-3."
  }
}

variable "availability_zones" {
  type    = list(string)
  default = ["ap-southeast-3a", "ap-southeast-3b"]

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "Production requires at least two Availability Zones."
  }
}

variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}

variable "artifact_bucket_name" {
  type = string
}

variable "artifact_cors_allowed_origins" {
  type = list(string)

  validation {
    condition     = length(var.artifact_cors_allowed_origins) > 0
    error_message = "At least one HTTPS production origin is required for presigned artifact upload CORS."
  }
}

variable "acm_certificate_arn" {
  type     = string
  default  = null
  nullable = true
}

variable "postgres_engine_version" {
  type    = string
  default = "18"
}

variable "rds_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "redis_engine_version" {
  type    = string
  default = "7.1"
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}

variable "redis_auth_token" {
  type      = string
  sensitive = true

  validation {
    condition     = length(var.redis_auth_token) >= 32 && length(var.redis_auth_token) <= 128
    error_message = "Redis AUTH token must contain 32-128 characters."
  }
}

variable "verifier_ami_id" {
  type = string
}

variable "verifier_instance_type" {
  type    = string
  default = "m6i.large"
}

variable "verifier_desired_capacity" {
  type    = number
  default = 0

  validation {
    condition     = var.verifier_desired_capacity >= 0 && var.verifier_desired_capacity <= 2
    error_message = "MVP verifier desired capacity must be between 0 and 2."
  }
}

variable "runsc_download_url" {
  type = string
}

variable "runsc_sha512" {
  type = string

  validation {
    condition     = can(regex("^[a-fA-F0-9]{128}$", var.runsc_sha512))
    error_message = "runsc_sha512 must be a 128-character hexadecimal SHA-512 digest."
  }
}

variable "github_oidc_thumbprints" {
  type        = list(string)
  description = "Current SHA-1 root CA thumbprints accepted by AWS IAM for token.actions.githubusercontent.com. Verify from the live certificate chain before production apply."

  validation {
    condition = (
      length(var.github_oidc_thumbprints) > 0 &&
      alltrue([for thumbprint in var.github_oidc_thumbprints : can(regex("^[a-fA-F0-9]{40}$", thumbprint))])
    )
    error_message = "At least one 40-character hexadecimal GitHub OIDC root CA SHA-1 thumbprint is required."
  }
}

variable "github_oidc_subject" {
  type        = string
  default     = "repo:marketmaul56-gif@326277591/testProject@1360769907:ref:refs/heads/main"
  description = "Immutable GitHub OIDC subject for this production repository/main branch."

  validation {
    condition     = var.github_oidc_subject == "repo:marketmaul56-gif@326277591/testProject@1360769907:ref:refs/heads/main"
    error_message = "Production release federation is locked to the immutable main-branch subject of marketmaul56-gif/testProject."
  }
}

variable "offline_validation" {
  type        = bool
  default     = false
  description = "CI-only switch that disables AWS account/credential discovery for an offline plan. Must stay false for real deployment."
}
