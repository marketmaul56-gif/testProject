output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_alb_dns_name" {
  value = aws_lb.public.dns_name
}

output "verifier_dispatcher_internal_dns_name" {
  value = aws_lb.verifier.dns_name
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecr_repository_urls" {
  value = { for name, repository in aws_ecr_repository.service : name => repository.repository_url }
}

output "rds_endpoint" {
  value     = aws_db_instance.main.endpoint
  sensitive = true
}

output "rds_master_secret_arn" {
  value     = try(aws_db_instance.main.master_user_secret[0].secret_arn, null)
  sensitive = true
}

output "redis_primary_endpoint" {
  value     = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive = true
}

output "artifact_bucket_name" {
  value = aws_s3_bucket.artifacts.bucket
}

output "runtime_secret_arns" {
  value     = { for name, secret in aws_secretsmanager_secret.runtime : name => secret.arn }
  sensitive = true
}

output "verifier_launch_template_id" {
  value = aws_launch_template.verifier.id
}

output "verifier_target_group_arn" {
  value = aws_lb_target_group.verifier.arn
}
