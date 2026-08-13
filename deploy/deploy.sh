#!/usr/bin/env bash
# =============================================================================
# Build the single-container image, push to ECR, store app config in Secrets
# Manager, and deploy the ALB + ECS/Fargate stack via CloudFormation.
#
# Uses a dedicated AWS CLI profile created from aws-backend/.env (see _aws_env.sh),
# scoped to account 971996090633. The deployed container uses the ECS task role
# instead of static keys.
#
# Prereqs: docker, aws CLI v2, python3.  Usage: ./deploy/deploy.sh
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root
ROOT="$PWD"
ENV_FILE="$ROOT/aws-backend/.env"

# ---- tunables (override via env) ----
STACK="${STACK:-opsguardian}"
ECR_REPO="${ECR_REPO:-opsguardian}"
SECRET_NAME="${SECRET_NAME:-opsguardian/app-env}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%s)}"

for bin in docker aws python3; do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERROR: '$bin' is required." >&2; exit 1; }
done

# ---- set up the 'ust' profile from .env and verify the target account ----
# Exports AWS_PROFILE / AWS_REGION and sets ACCOUNT_ID; aborts on account mismatch.
source deploy/_aws_env.sh

REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECR_URI="${REGISTRY}/${ECR_REPO}"
echo "==> Account ${ACCOUNT_ID} · region ${AWS_REGION} · image ${ECR_URI}:${IMAGE_TAG}"

# ---- 1) ECR repo + login ----
aws ecr describe-repositories --repository-names "$ECR_REPO" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$ECR_REPO" \
       --image-scanning-configuration scanOnPush=true >/dev/null
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

# ---- 2) build (linux/amd64 for Fargate) + push ----
echo "==> Building image..."
# --pull refreshes the base images so OS security patches land (see Dockerfile apt upgrade).
docker build --pull --platform linux/amd64 -f deploy/Dockerfile -t "${ECR_URI}:${IMAGE_TAG}" .
docker push "${ECR_URI}:${IMAGE_TAG}"

# ---- 3) app config -> Secrets Manager (AWS creds stripped) ----
echo "==> Syncing app config to Secrets Manager: ${SECRET_NAME}"
SECRET_JSON="$(python3 deploy/env_to_secret.py "$ENV_FILE")"
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" >/dev/null 2>&1; then
  aws secretsmanager put-secret-value --secret-id "$SECRET_NAME" --secret-string "$SECRET_JSON" >/dev/null
else
  aws secretsmanager create-secret --name "$SECRET_NAME" \
    --description "OpsGuardian application configuration" \
    --secret-string "$SECRET_JSON" >/dev/null
fi
SECRET_ARN="$(aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --query ARN --output text)"

# ---- 4) resolve VPC + 2 public subnets (>=2 AZs) ----
# Honour explicit overrides; otherwise auto-discover a VPC that has public subnets
# in at least two AZs (the default VPC in this account has no subnets).
if [ -n "${VPC_ID:-}" ] && [ -n "${SUBNETS:-}" ]; then
  echo "==> Using provided VPC ${VPC_ID} · subnets ${SUBNETS}"
else
  DISCO="$(aws ec2 describe-subnets \
    --filters Name=map-public-ip-on-launch,Values=true Name=state,Values=available \
    --query 'Subnets[].{Id:SubnetId,AZ:AvailabilityZone,Vpc:VpcId}' --output json)"
  read -r VPC_ID SUBNETS < <(python3 - "$DISCO" <<'PY'
import json, sys, collections
subs = json.loads(sys.argv[1])
byvpc = collections.defaultdict(dict)      # vpc -> {az: subnetId}
for s in subs:
    byvpc[s["Vpc"]].setdefault(s["AZ"], s["Id"])
for vpc, az in byvpc.items():
    if len(az) >= 2:                        # need 2 AZs for the ALB
        print(vpc, ",".join(list(az.values())[:2]))
        break
else:
    print("", "")
PY
)
  [ -n "$VPC_ID" ] && [ -n "$SUBNETS" ] \
    || { echo "ERROR: no VPC with public subnets in >=2 AZs found. Set VPC_ID and SUBNETS explicitly." >&2; exit 1; }
  echo "==> Discovered VPC ${VPC_ID} · subnets ${SUBNETS}"
fi

# ---- 4b) clear a prior failed stack (ROLLBACK_COMPLETE can't be updated) ----
ST="$(aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo NONE)"
case "$ST" in
  ROLLBACK_COMPLETE|CREATE_FAILED|ROLLBACK_FAILED|DELETE_FAILED|UPDATE_ROLLBACK_FAILED)
    echo "==> Removing prior failed stack ($ST)..."
    aws cloudformation delete-stack --stack-name "$STACK"
    if ! aws cloudformation wait stack-delete-complete --stack-name "$STACK" 2>/dev/null; then
      # A resource (e.g. an IAM role we lack delete perms on) blocked deletion.
      # Retry, retaining any resources still present so the stack can be removed.
      RETAIN=$(aws cloudformation describe-stack-resources --stack-name "$STACK" \
        --query "StackResources[?ResourceStatus=='DELETE_FAILED'].LogicalResourceId" --output text 2>/dev/null)
      if [ -n "$RETAIN" ]; then
        echo "    retaining undeletable resources: $RETAIN"
        aws cloudformation delete-stack --stack-name "$STACK" --retain-resources $RETAIN
        aws cloudformation wait stack-delete-complete --stack-name "$STACK" 2>/dev/null || true
      fi
    fi
    ;;
esac

# ---- 5) deploy CloudFormation ----
echo "==> Deploying CloudFormation stack: ${STACK}"
# Optionally reuse pre-created IAM roles (when the deploy identity lacks iam:CreateRole).
PARAMS=(ImageUri="${ECR_URI}:${IMAGE_TAG}" SecretArn="$SECRET_ARN" VpcId="$VPC_ID" Subnets="$SUBNETS")
[ -n "${EXEC_ROLE_ARN:-}" ] && PARAMS+=(ExecutionRoleArn="$EXEC_ROLE_ARN")
[ -n "${TASK_ROLE_ARN:-}" ] && PARAMS+=(TaskRoleArn="$TASK_ROLE_ARN")
[ -n "${CERT_ARN:-}" ] && PARAMS+=(CertificateArn="$CERT_ARN")

aws cloudformation deploy \
  --stack-name "$STACK" \
  --template-file deploy/cloudformation.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "${PARAMS[@]}"

# ---- 6) output ----
ALB_URL="$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='AlbUrl'].OutputValue" --output text)"
echo ""
echo "============================================================"
echo " Deployed.  App URL:  ${ALB_URL}"
echo " (ALB DNS can take 1–2 min to become healthy after first deploy.)"
echo "============================================================"
