variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-central-1"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_secret_arn" {
  description = "ARN of the AWS Secrets Manager secret for DB credentials"
  type        = string
}

variable "ecr_repository_url" {
  description = "ECR repository URL for branivo-api Docker image"
  type        = string
}
