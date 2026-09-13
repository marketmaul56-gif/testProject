resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [for value in var.github_oidc_thumbprints : lower(value)]
}

data "aws_iam_policy_document" "github_release_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [var.github_oidc_subject]
    }
  }
}

resource "aws_iam_role" "github_release" {
  name                 = "${local.name_prefix}-github-release"
  assume_role_policy   = data.aws_iam_policy_document.github_release_assume_role.json
  max_session_duration = 3600

  tags = {
    Purpose = "GitHub Actions production release federation"
  }
}

data "aws_iam_policy_document" "github_release" {
  statement {
    sid       = "EcrAuthorization"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "ImmutableImagePromotion"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:ListImages",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [for repository in aws_ecr_repository.service : repository.arn]
  }

  statement {
    sid    = "EcsReleaseControl"
    effect = "Allow"
    actions = [
      "ecs:DescribeClusters",
      "ecs:DescribeServices",
      "ecs:DescribeTaskDefinition",
      "ecs:ListServices",
      "ecs:RegisterTaskDefinition",
      "ecs:UpdateService",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "PassOnlyApplicationTaskRoles"
    effect = "Allow"
    actions = ["iam:PassRole"]
    resources = [
      aws_iam_role.ecs_execution.arn,
      aws_iam_role.web_task.arn,
      aws_iam_role.api_task.arn,
      aws_iam_role.worker_task.arn,
    ]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }

  statement {
    sid    = "VerifierCapacityReleaseControl"
    effect = "Allow"
    actions = [
      "autoscaling:DescribeAutoScalingGroups",
      "autoscaling:SetDesiredCapacity",
      "autoscaling:StartInstanceRefresh",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_release" {
  name   = "production-release"
  role   = aws_iam_role.github_release.id
  policy = data.aws_iam_policy_document.github_release.json
}

output "github_release_role_arn" {
  value = aws_iam_role.github_release.arn
}
