locals {
  name_prefix = substr("${var.project_name}-${var.environment}", 0, 24)
  az_index    = { for index, az in var.availability_zones : az => index }

  common_tags = {
    Project     = "AI-Native Skill Learning Platform"
    Environment = var.environment
    ManagedBy   = "OpenTofu"
    Baseline    = "PR.2"
  }

  runtime_secret_names = toset([
    "database-url",
    "auth-database-url",
    "better-auth-secret",
    "redis-url",
    "verifier-dispatcher-token",
    "openai-api-key",
  ])

  ecr_services = toset(["web", "api", "worker", "verifier-dispatcher"])
}
