variable "env"              { type = string }
variable "project"          { type = string }
variable "tags"             { type = map(string) }
variable "subnet_ids"       { type = list(string) }
variable "vpc_id"           { type = string }
variable "db_instance_class"{ type = string }
variable "multi_az"         { type = bool    default = false }
variable "db_name"          { type = string }
variable "db_secret_arn"    { type = string }
