data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "verifier_host" {
  name               = "${local.name_prefix}-verifier-host"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json
}

resource "aws_iam_role_policy_attachment" "verifier_ssm" {
  role       = aws_iam_role.verifier_host.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "verifier_ecr" {
  role       = aws_iam_role.verifier_host.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

data "aws_iam_policy_document" "verifier_runtime" {
  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/*"]
  }

  statement {
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.runtime["verifier-dispatcher-token"].arn]
  }
}

resource "aws_iam_role_policy" "verifier_runtime" {
  name   = "verifier-runtime"
  role   = aws_iam_role.verifier_host.id
  policy = data.aws_iam_policy_document.verifier_runtime.json
}

resource "aws_iam_instance_profile" "verifier" {
  name = "${local.name_prefix}-verifier"
  role = aws_iam_role.verifier_host.name
}

resource "aws_launch_template" "verifier" {
  name_prefix   = "${local.name_prefix}-verifier-"
  image_id      = var.verifier_ami_id
  instance_type = var.verifier_instance_type

  iam_instance_profile {
    name = aws_iam_instance_profile.verifier.name
  }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [aws_security_group.verifier.id]
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "disabled"
  }

  block_device_mappings {
    device_name = "/dev/xvda"

    ebs {
      encrypted             = true
      volume_size           = 40
      volume_type           = "gp3"
      delete_on_termination = true
    }
  }

  user_data = base64encode(templatefile("${path.module}/templates/verifier-user-data.sh.tftpl", {
    runsc_download_url = var.runsc_download_url
    runsc_sha512       = lower(var.runsc_sha512)
  }))

  tag_specifications {
    resource_type = "instance"
    tags          = merge(local.common_tags, { Name = "${local.name_prefix}-verifier" })
  }

  tag_specifications {
    resource_type = "volume"
    tags          = local.common_tags
  }
}

resource "aws_autoscaling_group" "verifier" {
  name                = "${local.name_prefix}-verifier"
  vpc_zone_identifier = [for subnet in aws_subnet.app : subnet.id]

  min_size         = 0
  max_size         = 2
  desired_capacity = var.verifier_desired_capacity

  health_check_type         = "EC2"
  health_check_grace_period = 300

  launch_template {
    id      = aws_launch_template.verifier.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "${local.name_prefix}-verifier"
    propagate_at_launch = true
  }

  lifecycle {
    ignore_changes = [desired_capacity]
  }
}
