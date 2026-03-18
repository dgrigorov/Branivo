output "cluster_arn"          { value = aws_ecs_cluster.main.arn }
output "alb_dns_name"         { value = aws_lb.main.dns_name }
output "ecr_repository_url"   { value = aws_ecr_repository.api.repository_url }
