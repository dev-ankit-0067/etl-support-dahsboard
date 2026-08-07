# OpsGuardian — AWS Fargate Deployment Architecture

Reference architecture for running the OpsGuardian ETL support dashboard on **AWS ECS / Fargate**,
behind an **Application Load Balancer**, with **all secrets in AWS Secrets Manager** and **read-only
access to client/tenant AWS accounts via STS AssumeRole**.

> This is an **architecture reference only** — no application code changes are implied. It describes
> a target deployment for the app documented in [`../codebase/`](../codebase/README.md).

## Diagram files

| File | Purpose |
|------|---------|
| [`opsguardian-fargate-architecture.svg`](./opsguardian-fargate-architecture.svg) | **Editable** vector source (grouped `<g>` layers + CSS classes). Open in Inkscape, Illustrator, Figma, or any browser. |
| [`opsguardian-fargate-architecture.png`](./opsguardian-fargate-architecture.png) | 3200×2280 (2×) raster export for docs, slides, and tickets. |

### Regenerating the PNG from the SVG

```bash
cd docs/diagrams
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --screenshot="opsguardian-fargate-architecture.png" \
  --window-size=1600,1140 --force-device-scale-factor=2 \
  --default-background-color=FFFFFFFF \
  "file://$PWD/opsguardian-fargate-architecture.svg"
```

(Any SVG rasteriser works — e.g. `rsvg-convert -z 2 in.svg -o out.png` or `inkscape --export-type=png`.)

---

## Components

### Ingress
- **Amazon Route 53** — public DNS for the dashboard hostname; **ACM** provides the TLS certificate.
- **Internet Gateway** — public ingress/egress for the VPC.
- **Application Load Balancer (ALB)** — internet-facing, HTTPS :443, spanning both AZs. Listener
  rules do **path-based routing**:
  - `/api/*` → **backend** target group (FastAPI, :8080)
  - `/*` → **frontend** target group (nginx + React SPA, :3000)

  This replaces the local nginx reverse proxy (`nginx/default.conf`) — the ALB performs the same
  split at the edge.

### Compute — Amazon ECS on AWS Fargate
Two ECS **services** run as Fargate tasks in **private subnets** (no public IPs), one task per AZ,
behind the shared ALB:
- **Frontend service** — container built from `artifacts/etl-dashboard` (nginx serving the Vite
  build), listening on :3000.
- **Backend service** — container built from `aws-backend` (FastAPI via gunicorn/uvicorn,
  `aws-backend/Dockerfile`), listening on :8080. This service reads secrets and assumes client roles.

Both services register with the ALB target groups and scale independently (target-tracking / step
scaling on CPU, memory, or ALB request count).

### Networking
- **VPC** `10.0.0.0/16`, multi-AZ.
- **Public subnets** (per AZ) — ALB nodes + **NAT gateways**.
- **Private subnets** (per AZ) — Fargate tasks + interface VPC endpoints.
- **Interface VPC Endpoints (AWS PrivateLink)** for **Secrets Manager, ECR (api + dkr), STS,
  CloudWatch Logs**, plus a **Gateway Endpoint for S3** (ECR image layers). Keeps AWS control-plane
  traffic on the private AWS network; only third-party SaaS egress (Jira, HuggingFace) leaves through
  the NAT gateways.

### Secrets & identity
- **AWS Secrets Manager** stores **all** secrets, KMS-encrypted:
  - Jira URL / username / API token
  - HuggingFace inference token
  - **Client cross-account Role ARNs + ExternalId** values
  - Any DB / app credentials
  Secrets are injected as ECS **task secrets** (env/file) at task start and/or fetched at runtime via
  `GetSecretValue`. This replaces the plaintext `.env` used locally (`aws-backend/.env.example`).
- **AWS IAM roles**:
  - **Task Execution Role** — pull images from ECR, write logs to CloudWatch, read the injected
    secrets at task startup.
  - **Task Role** — runtime permissions: `secretsmanager:GetSecretValue` and
    `sts:AssumeRole` into the client accounts. Scoped to least privilege
    (mirrors `aws-backend/iam-policy.json`).
- **AWS STS** — issues short-lived credentials when the backend assumes a client role.

### Platform services (regional)
- **Amazon ECR** — frontend & backend container image repositories.
- **Amazon CloudWatch Logs** — platform application logs (awslogs log driver).
- **CloudWatch Alarms / Container Insights** — health, autoscaling signals, ALB target metrics.

### External SaaS (reached via NAT egress)
- **Jira Cloud** — incident / RCA data and ticket creation (`jira` SDK).
- **HuggingFace Inference** — LLM log analysis via the LangChain agents.

### Client / tenant AWS accounts (cross-account)
Each monitored account holds an **IAM Role `OpsGuardian-CrossAccount-ReadOnly`** whose **trust
policy** allows the platform **Task Role** to assume it, gated by an **ExternalId** (confused-deputy
protection). The role grants **read-only** access to the tenant's:
- **CloudWatch Logs** (Glue job & Lambda log groups)
- **AWS Glue** (jobs / runs)
- **AWS Lambda** (functions / metrics)
- **Cost Explorer + Budgets**

These are exactly the services the backend consumes today (see
[`../codebase/02-backend-python.md`](../codebase/02-backend-python.md)); the only change from the
single-account setup is that the calls run under an **assumed-role session** in the tenant account.

---

## Key flows

Legend: **solid** = HTTP request path · **red dashed** = IAM / secure control (AssumeRole, Secrets,
PrivateLink) · **teal dotted** = internet egress via NAT.

1. **User request** — Route 53 → IGW → ALB → (path rule) → frontend or backend Fargate task.
2. **Secrets at boot/runtime** — task → PrivateLink → Secrets Manager (`GetSecretValue`); execution
   role pulls the image from ECR; logs flow to CloudWatch Logs.
3. **Cross-account read** — backend Task Role → STS `AssumeRole(RoleArn, ExternalId)` → temporary
   credentials → read CloudWatch Logs / Glue / Lambda / Cost Explorer **in the client account**.
4. **SaaS egress** — backend → NAT gateway → IGW → **Jira** and **HuggingFace** over HTTPS.

---

## How this maps to the current app

| Local / single-account (today) | Fargate deployment (this diagram) |
|--------------------------------|-----------------------------------|
| `startup.sh` runs uvicorn :8080 + Vite preview :3000 | Two ECS/Fargate services, one per container |
| `nginx/default.conf` splits `/api` vs `/` | ALB listener path rules split `/api/*` vs `/*` |
| Secrets in `.env` (`aws-backend/.env.example`) | AWS Secrets Manager → ECS task secrets |
| Default AWS credential chain, one account | Task Role + **STS AssumeRole** into each client account |
| Local Docker image (`aws-backend/Dockerfile`) | Images in Amazon ECR |
| stdout JSON logs | CloudWatch Logs + Container Insights |

---

## Notes & options
- **Frontend hosting alternative:** the React SPA could instead be served from **S3 + CloudFront**
  (static), leaving only the backend on Fargate. The diagram keeps it on Fargate to preserve a single
  ALB entry point and match the current nginx-based split.
- **Per-tenant isolation:** the ExternalId + a dedicated role per client account keeps tenant access
  auditable; role ARNs live in Secrets Manager so onboarding a new client needs no redeploy.
- **High availability:** ALB, NAT, and Fargate tasks are spread across two AZs; scale the desired
  task count and NAT gateways per AZ as needed.
- **Editing the diagram:** every region is a named SVG group (`#ingress`, `#platform-account`,
  `#private-subnets`, `#regional-services`, `#client-accounts`, `#external-saas`, `#flows`); category
  colours are CSS classes (`.b-net`, `.b-compute`, `.b-sec`, `.b-store`, `.b-mgmt`, `.b-ext`,
  `.b-client`) — change a fill once and it updates everywhere.
