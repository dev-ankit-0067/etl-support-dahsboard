#!/usr/bin/env bash
# Sourced by deploy.sh / teardown.sh.
# (Re)creates a dedicated AWS CLI profile from aws-backend/.env and verifies the
# target account before any AWS action. Re-syncing on every run means expiring
# SSO/temporary credentials are refreshed simply by updating .env and re-running.
#
# Overridable via env: AWS_DEPLOY_PROFILE (default "ust"), EXPECTED_ACCOUNT.
set -euo pipefail

# deploy.sh / teardown.sh cd to the repo root before sourcing this file.
ROOT="${ROOT:-$(pwd)}"
ENV_FILE="$ROOT/aws-backend/.env"
PROFILE="${AWS_DEPLOY_PROFILE:-ust}"
EXPECTED_ACCOUNT="${EXPECTED_ACCOUNT:-971996090633}"

[ -f "$ENV_FILE" ] || { echo "ERROR: $ENV_FILE not found." >&2; exit 1; }
command -v aws >/dev/null 2>&1 || { echo "ERROR: aws CLI not found." >&2; exit 1; }

_get_env() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }

_AKID="$(_get_env AWS_ACCESS_KEY_ID)"
_SAK="$(_get_env AWS_SECRET_ACCESS_KEY)"
_TOKEN="$(_get_env AWS_SESSION_TOKEN || true)"
_REGION="$(_get_env AWS_REGION)"; _REGION="${_REGION:-us-east-1}"

[ -n "$_AKID" ] && [ -n "$_SAK" ] \
  || { echo "ERROR: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY not set (uncommented) in $ENV_FILE." >&2; exit 1; }

# (Re)write the dedicated profile from the current .env values.
aws configure set aws_access_key_id     "$_AKID"  --profile "$PROFILE"
aws configure set aws_secret_access_key "$_SAK"   --profile "$PROFILE"
[ -n "$_TOKEN" ] && aws configure set aws_session_token "$_TOKEN" --profile "$PROFILE"
aws configure set region "$_REGION" --profile "$PROFILE"
aws configure set output json        --profile "$PROFILE"

# Use ONLY the profile — ignore any AWS_* creds already exported in the shell.
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN 2>/dev/null || true
export AWS_PROFILE="$PROFILE"
export AWS_REGION="$_REGION" AWS_DEFAULT_REGION="$_REGION"

# Safety guard: never act on the wrong account.
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "UNKNOWN")"
if [ "$ACCOUNT_ID" != "$EXPECTED_ACCOUNT" ]; then
  echo "ERROR: profile '$PROFILE' resolves to account '$ACCOUNT_ID', expected '$EXPECTED_ACCOUNT'." >&2
  echo "       Refresh the credentials in $ENV_FILE (SSO tokens expire) or set EXPECTED_ACCOUNT to override." >&2
  exit 1
fi
echo "==> AWS profile '$PROFILE' · account $ACCOUNT_ID · region $_REGION"
