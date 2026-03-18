terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "branivo-tfstate-dev"
    key    = "dev/terraform.tfstate"
    region = "eu-central-1"
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  env     = "dev"
  project = "branivo"
  tags = {
    Project     = "Branivo"
    Environment = local.env
    ManagedBy   = "Terraform"
  }
}

module "networking" {
  source      = "../../modules/networking"
  env         = local.env
  project     = local.project
  tags        = local.tags
  vpc_cidr    = var.vpc_cidr
  aws_region  = var.aws_region
}

module "rds" {
  source             = "../../modules/rds"
  env                = local.env
  project            = local.project
  tags               = local.tags
  subnet_ids         = module.networking.private_subnet_ids
  vpc_id             = module.networking.vpc_id
  db_instance_class  = "db.t3.medium"
  multi_az           = false
  db_name            = "branivo_dev"
  db_secret_arn      = var.db_secret_arn
}

module "redis" {
  source            = "../../modules/redis"
  env               = local.env
  project           = local.project
  tags              = local.tags
  subnet_ids        = module.networking.private_subnet_ids
  vpc_id            = module.networking.vpc_id
  node_type         = "cache.t3.micro"
}

module "s3" {
  source    = "../../modules/s3"
  env       = local.env
  project   = local.project
  tags      = local.tags
  bucket_name = "branivo-documents-dev"
}

module "ecs" {
  source             = "../../modules/ecs"
  env                = local.env
  project            = local.project
  tags               = local.tags
  vpc_id             = module.networking.vpc_id
  public_subnet_ids  = module.networking.public_subnet_ids
  private_subnet_ids = module.networking.private_subnet_ids
  ecr_repository_url = var.ecr_repository_url
  db_secret_arn      = var.db_secret_arn
  redis_url          = "redis://${module.redis.primary_endpoint}:6379"
  s3_bucket          = module.s3.bucket_name
  aws_region         = var.aws_region
}
