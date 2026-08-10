# Deploy — OpsGuardian on AWS Fargate (single container + ALB)

Deploys the **frontend and backend in one container** to **ECS/Fargate**, fronted by an
**Application Load Balancer**. At runtime the app uses the **ECS task role** for AWS access (no
static keys), and all other configuration is pulled from **AWS Secrets Manager**.

> Matches the reference diagram in [`../docs/diagrams/`](../docs/diagrams/fargate-deployment.md)
> (default-VPC / HTTP-only variant).

## What gets created

| Resource | Purpose |
|----------|---------|
| **ECR repo** `opsguardian` | Holds the built container image |
| **Secrets Manager secret** `opsguardian/app-env` | All app env vars **except** AWS credentials |
| **CloudFormation stack** `opsguardian` | ALB + listener + target group, ECS cluster + Fargate service + task definition, 2 security groups, CloudWatch log group, and two IAM roles |
| **IAM Task Role** | Runtime AWS read access (Glue, Lambda, CloudWatch, Cost Explorer/Budgets, STS) — mirrors `aws-backend/iam-policy.json` |
| **IAM Execution Role** | Pull image from ECR, write logs, read the secret at task start |

## The single container (`Dockerfile`)

- **Stage 1** builds the React SPA with Vite.
- **Stage 2** runs **nginx** (serves the SPA, reverse-proxies `/api` and `/healthz` to `127.0.0.1:8080`)
  and the **FastAPI** backend (gunicorn + UvicornWorker), both under **supervisord**. Exposes port 80.
- `entrypoint.sh` expands the injected secret (`APP_SECRETS_JSON`) into environment variables,
  **skipping AWS credential keys** so boto3 falls back to the ECS task role.

## How config & credentials flow

```
aws-backend/.env  ──(deploy.sh)──►  used only to authenticate the AWS CLI at deploy time
                  ──(env_to_secret.py: drops AWS_* creds)──►  Secrets Manager (opsguardian/app-env)
                                                                       │
                                        ECS injects whole secret ──────┘ as APP_SECRETS_JSON
                                                                       │
                                        entrypoint.sh expands → app env (pydantic Settings)
Runtime AWS calls ──────────────────────────────────────────►  ECS Task Role (no static keys)
```

## AWS profile & target account

The scripts use a **dedicated AWS CLI profile named `ust`**, created/refreshed from
`aws-backend/.env` by `deploy/_aws_env.sh` on every run, and **guarded to account
`971996090633`** — if the credentials resolve to any other account, the run aborts before touching
AWS. This keeps the deploy isolated from your other saved profiles (`default`, `prod`, …).

Override if needed: `AWS_DEPLOY_PROFILE=<name>` and `EXPECTED_ACCOUNT=<id>`.

> **Temporary credentials:** the `.env` keys are UST SSO credentials (they include a session token)
> and **expire after a few hours**. When they do, refresh `aws-backend/.env` with new values (e.g.
> from `aws sso login` / the SSO portal) and re-run `deploy.sh` — the profile is re-synced from
> `.env` automatically.

## Authentication (Cognito)

The dashboard is gated by a login page backed by a **Cognito User Pool**. Provision it once:

```bash
./deploy/setup-cognito.sh      # creates pool + app client + admin user; writes COGNITO_* to .env
```

This creates:
- User Pool `opsguardian-users`, public app client `opsguardian-web` (USER_PASSWORD_AUTH), and user
  **`admin` / `OpsG@123`**.
- Writes `COGNITO_USER_POOL_ID` / `COGNITO_CLIENT_ID` / `COGNITO_REGION` into `aws-backend/.env`.

At runtime the backend exposes these (non-secret) at `GET /api/config`; the SPA reads them, shows the
login page, and authenticates directly against Cognito. Because the values are in `.env`, they flow
into Secrets Manager on the next `deploy.sh`, so the deployed app is login-gated automatically.

> If `COGNITO_*` is unset (e.g. local dev without running the script), the app runs **open** (no
> login). Run `setup-cognito.sh` — or set the three vars — to enforce login.
>
> Note: the API itself is not yet JWT-validated server-side (front-end route gating only); the SPA
> does send the Cognito ID token as a bearer on generated API calls, ready for backend enforcement.

## Prerequisites

- **Docker** (running), **AWS CLI v2**, **python3** on the machine you deploy from.
- `aws-backend/.env` with **uncommented** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `AWS_SESSION_TOKEN` (for SSO), and `AWS_REGION`. Used **only** to run the deploy and to create the
  `ust` profile; never shipped in the image or written to the app secret.
- The deploy identity needs permissions for: ECR, ECS, ELBv2, EC2 (describe VPC/subnets, security
  groups), IAM (create the two roles), CloudFormation, Secrets Manager, and CloudWatch Logs.

## Deploy

```bash
./deploy/deploy.sh
```

Optional overrides (env vars): `STACK`, `ECR_REPO`, `SECRET_NAME`, `IMAGE_TAG`.
On success it prints the public URL, e.g. `http://opsguardian-alb-xxxx.us-east-1.elb.amazonaws.com`.
Allow 1–2 minutes after the first deploy for the target to pass health checks.

### Redeploying after code changes
Re-run `./deploy/deploy.sh` — it rebuilds/pushes a new image tag and updates the stack (rolling
deployment). To only refresh config, edit `aws-backend/.env` and re-run (it updates the secret; ECS
picks up new secret values on the next task start / `aws ecs update-service --force-new-deployment`).

## Verify

```bash
curl http://<alb-dns>/healthz          # {"status":"ok","version":"1.0.0"}
open  http://<alb-dns>/                 # dashboard UI
```

Logs: CloudWatch log group `/ecs/opsguardian` (both nginx and backend stream there).

## Tear down

```bash
./deploy/teardown.sh
```

Deletes the CloudFormation stack, the ECR repo (with images), and the secret.

## Notes & options

- **HTTP only** on the ALB (port 80) per the chosen setup. To add HTTPS: request/import an ACM cert,
  add an `AWS::ElasticLoadBalancingV2::Listener` on 443 with `Certificates` + `SslPolicy`, and
  (optionally) redirect 80→443. Ask and I'll wire it in.
- **Default VPC / public subnets**: the task runs with a public IP (`AssignPublicIp: ENABLED`) so it
  can pull from ECR and Secrets Manager without a NAT gateway. For the private-subnet + NAT topology,
  switch to the "new VPC" variant from the design doc.
- **Scaling**: `DesiredCount` is 1. Raise it (and add an `AWS::ApplicationAutoScaling` target) for HA.
  `WEB_CONCURRENCY=2` caps gunicorn workers so they match the 1 vCPU task size.
- **Cost**: an always-on ALB + one Fargate task (1 vCPU / 2 GB) + logs. Run `teardown.sh` when idle.
- **Secrets**: rotating a value = edit `aws-backend/.env`, re-run `deploy.sh`, then force a new
  deployment so tasks re-read the secret.
