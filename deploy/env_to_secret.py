#!/usr/bin/env python3
"""Convert aws-backend/.env into a JSON object for AWS Secrets Manager.

AWS credential keys are dropped — the deployed container uses the ECS task role,
not static keys. Everything else in the env file is included so the app receives
its full configuration from Secrets Manager at runtime.

Usage: python3 deploy/env_to_secret.py aws-backend/.env  ->  prints JSON to stdout
"""
from __future__ import annotations

import json
import sys

# Credentials that must NOT be shipped — replaced by the ECS task role at runtime.
DROP = {
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_PROFILE",
}


def parse_env(path: str) -> dict[str, str]:
    out: dict[str, str] = {}
    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip()
            # strip matching surrounding quotes
            if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
                val = val[1:-1]
            if key.upper() in DROP:
                continue
            out[key] = val
    return out


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: env_to_secret.py <path-to-.env>", file=sys.stderr)
        raise SystemExit(2)
    print(json.dumps(parse_env(sys.argv[1])))
