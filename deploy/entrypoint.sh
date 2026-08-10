#!/usr/bin/env bash
set -euo pipefail

# ECS injects the whole Secrets Manager secret as APP_SECRETS_JSON (a JSON object).
# Export each key as an environment variable so pydantic-settings (Settings) reads
# them. AWS credential keys are intentionally skipped — at runtime the app uses the
# ECS task role via the default boto3 credential chain.
if [ -n "${APP_SECRETS_JSON:-}" ]; then
  eval "$(APP_SECRETS_JSON="$APP_SECRETS_JSON" python3 - <<'PY'
import json, os, shlex
data = json.loads(os.environ["APP_SECRETS_JSON"])
skip = {"AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE"}
for k, v in data.items():
    if k.upper() in skip:
        continue
    print(f"export {k}={shlex.quote(str(v))}")
PY
)"
fi

exec /usr/bin/supervisord -c /etc/supervisord.conf
