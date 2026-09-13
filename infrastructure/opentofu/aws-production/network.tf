resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${local.name_prefix}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name_prefix}-igw" }
}

resource "aws_subnet" "public" {
  for_each = local.az_index

  vpc_id                  = aws_vpc.main.id
  availability_zone       = each.key
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, each.value)
  map_public_ip_on_launch = false

  tags = { Name = "${local.name_prefix}-public-${each.value + 1}", Tier = "public" }
}

resource "aws_subnet" "app" {
  for_each = local.az_index

  vpc_id            = aws_vpc.main.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, each.value + 10)

  tags = { Name = "${local.name_prefix}-app-${each.value + 1}", Tier = "application" }
}

resource "aws_subnet" "data" {
  for_each = local.az_index

  vpc_id            = aws_vpc.main.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, each.value + 20)

  tags = { Name = "${local.name_prefix}-data-${each.value + 1}", Tier = "data" }
}

resource "aws_eip" "nat" {
  for_each = local.az_index
  domain   = "vpc"
  tags     = { Name = "${local.name_prefix}-nat-${each.value + 1}" }
}

resource "aws_nat_gateway" "main" {
  for_each = local.az_index

  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = aws_subnet.public[each.key].id

  depends_on = [aws_internet_gateway.main]
  tags       = { Name = "${local.name_prefix}-nat-${each.value + 1}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${local.name_prefix}-public" }
}

resource "aws_route_table_association" "public" {
  for_each = local.az_index

  subnet_id      = aws_subnet.public[each.key].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "app" {
  for_each = local.az_index

  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[each.key].id
  }

  tags = { Name = "${local.name_prefix}-app-${each.value + 1}" }
}

resource "aws_route_table_association" "app" {
  for_each = local.az_index

  subnet_id      = aws_subnet.app[each.key].id
  route_table_id = aws_route_table.app[each.key].id
}

resource "aws_route_table" "data" {
  for_each = local.az_index

  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name_prefix}-data-${each.value + 1}" }
}

resource "aws_route_table_association" "data" {
  for_each = local.az_index

  subnet_id      = aws_subnet.data[each.key].id
  route_table_id = aws_route_table.data[each.key].id
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [for route_table in aws_route_table.app : route_table.id]

  tags = { Name = "${local.name_prefix}-s3-endpoint" }
}
