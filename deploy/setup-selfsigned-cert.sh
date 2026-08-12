#!/usr/bin/env bash
# =============================================================================
# Generate a self-signed TLS certificate for the ALB's DNS name and import it
# into ACM, printing the certificate ARN (the only thing on stdout).
#
# Self-signed = browsers will warn (untrusted CA). Fine for testing; use a real
# ACM/public cert for a domain you own in production.
#
# Usage:   CERT_ARN=$(./deploy/setup-selfsigned-cert.sh)   # capture the ARN
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
STACK="${STACK:-opsguardian}"

# Sets up the 'ust' profile + account guard. Logs go to stderr so stdout stays clean.
source deploy/_aws_env.sh 1>&2

# Discover the ALB DNS name from the deployed stack (fallback: env ALB_DNS).
ALB_DNS="${ALB_DNS:-}"
if [ -z "$ALB_DNS" ]; then
  ALB_URL="$(aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='AlbUrl'].OutputValue" --output text 2>/dev/null || true)"
  ALB_DNS="${ALB_URL#http://}"; ALB_DNS="${ALB_DNS#https://}"
fi
[ -n "$ALB_DNS" ] || { echo "ERROR: could not determine ALB DNS name (deploy the stack first, or set ALB_DNS)." >&2; exit 1; }
echo "==> Certificate CN/SAN: ${ALB_DNS}" >&2

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" \
  -subj "/CN=${ALB_DNS}" \
  -addext "subjectAltName=DNS:${ALB_DNS}" 1>&2

echo "==> Importing self-signed cert into ACM..." >&2
CERT_ARN="$(aws acm import-certificate \
  --certificate "fileb://$TMP/cert.pem" \
  --private-key "fileb://$TMP/key.pem" \
  --tags Key=app,Value=opsguardian Key=type,Value=self-signed \
  --query CertificateArn --output text)"
echo "==> Imported: ${CERT_ARN}" >&2

# The ARN is the only thing on stdout, so it can be captured.
printf '%s\n' "$CERT_ARN"
