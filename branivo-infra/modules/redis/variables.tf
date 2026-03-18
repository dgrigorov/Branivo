variable "env"        { type = string }
variable "project"    { type = string }
variable "tags"       { type = map(string) }
variable "subnet_ids" { type = list(string) }
variable "vpc_id"     { type = string }
variable "node_type"  { type = string default = "cache.t3.micro" }
