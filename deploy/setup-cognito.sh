#!/usr/bin/env bash
# =============================================================================
# Create (idempotently) a Cognito User Pool + public app client + admin user,
# then write the pool/client IDs into aws-backend/.env so the app serves them
# via /api/config. Uses the dedicated 'ust' profile + account guard.
#
# Usage: ./deploy/setup-cognito.sh
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

POOL_NAME="${COGNITO_POOL_NAME:-opsguardian-users}"
CLIENT_NAME="${COGNITO_CLIENT_NAME:-opsguardian-web}"
ADMIN_USER="${COGNITO_ADMIN_USER:-admin}"
ADMIN_PASS="${COGNITO_ADMIN_PASS:-OpsG@123}"

# Sets up the 'ust' profile, verifies account 971996090633, exports AWS_REGION / ENV_FILE.
source deploy/_aws_env.sh

echo "==> Ensuring user pool '${POOL_NAME}'"
POOL_ID="$(aws cognito-idp list-user-pools --max-results 60 \
  --query "UserPools[?Name=='${POOL_NAME}'].Id | [0]" --output text)"
if [ -z "$POOL_ID" ] || [ "$POOL_ID" = "None" ]; then
  POOL_ID="$(aws cognito-idp create-user-pool --pool-name "$POOL_NAME" \
    --policies '{"PasswordPolicy":{"MinimumLength":8,"RequireUppercase":true,"RequireLowercase":true,"RequireNumbers":true,"RequireSymbols":true}}' \
    --query 'UserPool.Id' --output text)"
  echo "    created pool ${POOL_ID}"
else
  echo "    reusing pool ${POOL_ID}"
fi

echo "==> Ensuring app client '${CLIENT_NAME}' (public, USER_PASSWORD_AUTH)"
CLIENT_ID="$(aws cognito-idp list-user-pool-clients --user-pool-id "$POOL_ID" --max-results 60 \
  --query "UserPoolClients[?ClientName=='${CLIENT_NAME}'].ClientId | [0]" --output text)"
if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" = "None" ]; then
  CLIENT_ID="$(aws cognito-idp create-user-pool-client --user-pool-id "$POOL_ID" \
    --client-name "$CLIENT_NAME" --no-generate-secret \
    --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_SRP_AUTH \
    --query 'UserPoolClient.ClientId' --output text)"
  echo "    created client ${CLIENT_ID}"
else
  echo "    reusing client ${CLIENT_ID}"
fi

echo "==> Ensuring user '${ADMIN_USER}'"
if aws cognito-idp admin-get-user --user-pool-id "$POOL_ID" --username "$ADMIN_USER" >/dev/null 2>&1; then
  echo "    user exists — resetting password"
else
  aws cognito-idp admin-create-user --user-pool-id "$POOL_ID" \
    --username "$ADMIN_USER" --message-action SUPPRESS >/dev/null
  echo "    created user"
fi
aws cognito-idp admin-set-user-password --user-pool-id "$POOL_ID" \
  --username "$ADMIN_USER" --password "$ADMIN_PASS" --permanent
echo "    password set (permanent)"

echo "==> Writing Cognito config into ${ENV_FILE}"
python3 - "$ENV_FILE" "$POOL_ID" "$CLIENT_ID" "$AWS_REGION" <<'PY'
import sys, re
path, pool, client, region = sys.argv[1:5]
vals = {"COGNITO_USER_POOL_ID": pool, "COGNITO_CLIENT_ID": client, "COGNITO_REGION": region}
lines = open(path).read().splitlines() if __import__("os").path.exists(path) else []
seen = set()
out = []
for ln in lines:
    m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=", ln)
    if m and m.group(1) in vals:
        out.append(f"{m.group(1)}={vals[m.group(1)]}"); seen.add(m.group(1))
    else:
        out.append(ln)
for k, v in vals.items():
    if k not in seen:
        out.append(f"{k}={v}")
open(path, "w").write("\n".join(out) + "\n")
PY

echo ""
echo "============================================================"
echo " Cognito ready."
echo "   User Pool ID : ${POOL_ID}"
echo "   App Client ID: ${CLIENT_ID}"
echo "   Region       : ${AWS_REGION}"
echo "   Login        : ${ADMIN_USER} / ${ADMIN_PASS}"
echo " Written to aws-backend/.env (COGNITO_*). Restart the backend"
echo " locally, or re-run ./deploy/deploy.sh to roll it out."
echo "============================================================"
