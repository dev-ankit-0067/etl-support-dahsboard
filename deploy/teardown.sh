#!/usr/bin/env bash
# Tear down everything deploy.sh created: CloudFormation stack, ECR repo, secret.
# Uses the dedicated 'ust' profile and the same account guard as deploy.sh.
set -euo pipefail

cd "$(dirname "$0")/.."

STACK="${STACK:-opsguardian}"
ECR_REPO="${ECR_REPO:-opsguardian}"
SECRET_NAME="${SECRET_NAME:-opsguardian/app-env}"

# Sets up the 'ust' profile and verifies the account before deleting anything.
source deploy/_aws_env.sh

echo "==> Deleting CloudFormation stack: ${STACK}"
aws cloudformation delete-stack --stack-name "$STACK"
aws cloudformation wait stack-delete-complete --stack-name "$STACK" || true

echo "==> Deleting ECR repo: ${ECR_REPO}"
aws ecr delete-repository --repository-name "$ECR_REPO" --force >/dev/null 2>&1 || true

echo "==> Scheduling secret deletion: ${SECRET_NAME}"
aws secretsmanager delete-secret --secret-id "$SECRET_NAME" \
  --force-delete-without-recovery >/dev/null 2>&1 || true

echo "Teardown complete."
