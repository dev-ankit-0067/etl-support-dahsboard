# 07 · Deployment, configuration & operations

How the app is provisioned, started, proxied, containerised, and secured.

## 1. Runtime topology (as shipped)

`startup.sh` runs three processes:

| Process | Command | Port |
|---------|---------|------|
| FastAPI backend | `python -m uvicorn app.main:app --host 0.0.0.0 --port 8080` (from `aws-backend/`) | 8080 |
| Frontend preview | `pnpm --dir artifacts/etl-dashboard run serve` (Vite preview of the built SPA) | 3000 |
| nginx | copies `nginx/default.conf` → `/etc/nginx/conf.d/default.conf`, tests, restarts | 80 |

nginx routes `/api/` → `127.0.0.1:8080` and `/` → `127.0.0.1:3000` (with WebSocket upgrade headers
for Vite HMR).

## 2. Provisioning — `setup.py`

Idempotent one-shot setup (Debian/Ubuntu, apt-based; requires sudo/root):
1. `ensure_system_packages()` — installs python3, python3-venv, nodejs, npm, nginx as needed.
2. `ensure_pnpm()` — `npm install -g pnpm` if missing.
3. `ensure_python_env()` — creates `.venv`, upgrades pip, installs `aws-backend/requirements.txt`.
4. `install_frontend_dependencies()` — `pnpm install --frozen-lockfile` then builds the dashboard.
5. `install_nginx_config()` — copies `nginx/default.conf` to `sites-available/default`, symlinks it
   into `sites-enabled`, removes any conflicting `conf.d/default.conf`, tests and restarts nginx.

Run `./setup.py` once, then `./startup.sh`.

## 3. Start / stop scripts

- **`startup.sh`** — validates prerequisites (python3, node, pnpm, `.venv`), frees ports 3000/8080,
  kills stale `vite preview` / `uvicorn` processes, launches backend + frontend (logging to
  `logs/backend.log` / `logs/frontend.log`, PIDs in `logs/pids`), installs the nginx config, and
  `wait`s on the backend. A `trap cleanup EXIT` kills children and stops nginx on exit.
- **`stop.sh`** — kills every PID in `logs/pids` and stops nginx.

## 4. Frontend build & serve
- Build: `pnpm --dir artifacts/etl-dashboard run build` → `dist/public` (Vite).
- Serve: `pnpm --dir artifacts/etl-dashboard run serve` (Vite preview, host `0.0.0.0`).
- Dev (with live backend proxy): `pnpm --dir artifacts/etl-dashboard run dev` — proxies `/api` to
  `localhost:8080`.

## 5. Backend container — `aws-backend/Dockerfile`
- Base `python:3.12-slim`; installs `requirements.txt`; copies `app/` and `gunicorn_conf.py`.
- Runs as a non-root `appuser` (uid 10001); exposes `8000`.
- `HEALTHCHECK` curls `/healthz`.
- CMD: `gunicorn -c gunicorn_conf.py app.main:app`.

### `gunicorn_conf.py`
`bind = 0.0.0.0:$PORT` (default 8000); `workers = WEB_CONCURRENCY` (default `max(2, cpu_count())`);
`worker_class = uvicorn.workers.UvicornWorker`; `timeout` = `GUNICORN_TIMEOUT` (default 60s),
`keepalive` 5s, `graceful_timeout` 30s; access/error logs to stdout; `forwarded_allow_ips = "*"`.

> The AI-agent path (`POST /api/agents/analyze` — LLM inference + log fetch + ticket creation) can
> run longer than the 60s default, which kills the worker mid-request. Deploy with
> `GUNICORN_TIMEOUT=300` (and match the ALB idle timeout; see §11).

> Note the port mismatch to be aware of: `startup.sh` runs uvicorn on **8080**, while the Docker
> image / gunicorn default to **8000**. Set `PORT`/nginx upstream consistently for your target.

## 6. Reverse proxy — `nginx/default.conf`
```
location /api/ { proxy_pass http://127.0.0.1:8080; … }   # backend
location /     { proxy_pass http://127.0.0.1:3000; … }   # frontend (+ WS upgrade)
```
Forwards `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`.

## 7. IAM policy — `aws-backend/iam-policy.json`
Least-privilege, read-mostly policy the FastAPI backend needs:
- **GlueRead** — `glue:GetJobs/GetJob/GetJobRuns/GetJobRun`
- **LambdaRead** — `lambda:ListFunctions/GetFunction/ListTags`
- **EmrRead / EmrServerlessRead** — `elasticmapreduce:*` (list/describe clusters/steps),
  `emr-serverless:*` (list/get applications/job runs)
- **TagRead** — `tag:GetResources/GetTagKeys/GetTagValues` (project tag filtering)
- **S3LogsRead** — `s3:GetObject/ListBucket` (custom S3 log source, `S3_LOG_BUCKET`)
- **CloudWatchRead** — `cloudwatch:GetMetricStatistics/GetMetricData/ListMetrics`,
  `logs:DescribeLogStreams/GetLogEvents`
- **IncidentsRead** — `ssm-incidents:ListIncidentRecords/GetIncidentRecord/ListTimelineEvents`
  *(present for a future SSM Incident Manager source; the current code uses the MCP-based provider — Jira/ServiceNow)*
- **CostExplorerRead** — `ce:GetCostAndUsage/GetCostForecast`,
  `budgets:DescribeBudgets/ViewBudget`, `sts:GetCallerIdentity`

Credentials resolve via the default chain (env vars, profile, or an IAM role / IRSA / task role) —
see `aws.py`.

## 8. Environment variables (`aws-backend/.env.example`)

| Group | Keys |
|-------|------|
| App | `APP_ENV`, `LOG_LEVEL`, `API_PREFIX`, `CORS_ALLOW_ORIGINS` |
| AWS | `AWS_REGION`, `AWS_PROFILE`, `AWS_ACCESS_KEY_ID/SECRET/SESSION_TOKEN` (optional) |
| boto | `BOTO_MAX_ATTEMPTS`, `BOTO_RETRY_MODE`, `BOTO_CONNECT_TIMEOUT`, `BOTO_READ_TIMEOUT` |
| Cache | `CACHE_TTL_SHORT/MEDIUM/LONG` |
| Domain | `GLUE_JOB_NAME_FILTER`, `LAMBDA_FUNCTION_TAG_KEY/VALUE`, `COST_EXPLORER_TAG_KEY`, `SLA_BREACH_MINUTES` |
| Log sources | `EMR_LOG_GROUP`, `EMR_SERVERLESS_LOG_GROUP`, `S3_LOG_BUCKET` (custom S3 log source) |
| Incident provider | `INCIDENT_PROVIDER` (`jira` \| `servicenow`, default `jira`) — selects the MCP server used for incidents/RCA/ticket creation |
| Jira (provider=jira) | `JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`, `JIRA_ISSUE_TYPE`, `USE_JIRA_INCIDENTS` |
| ServiceNow (provider=servicenow) | `SERVICENOW_INSTANCE`, `SERVICENOW_USER`, `SERVICENOW_PASSWORD`, `SERVICENOW_TABLE`, `SERVICENOW_PROJECT_FIELD` |
| LLM | `HUGGINGFACE_API_TOKEN`, `HUGGINGFACE_MODEL` (default `Qwen/Qwen2.5-72B-Instruct`; see [agents-api.md](./agents-api.md#supported-models) for the Mistral-7B caveat) |
| Gunicorn | `GUNICORN_TIMEOUT` (default 60s — raise to 300 for the AI-agent path), `WEB_CONCURRENCY` |

Frontend build-time: `PORT`, `BASE_PATH`/`BASE_URL`.

## 9. Monorepo commands (contributor cheat-sheet)

| Command | Effect |
|---------|--------|
| `pnpm install` | Install all workspace deps (honours the 1-day min-release-age guard) |
| `pnpm run typecheck` | Typecheck libs + artifacts |
| `pnpm run build` | Typecheck + build every package |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate React-Query hooks + Zod schemas from `openapi.yaml` |
| `pnpm --filter @workspace/api-server run dev` | Run the Express mock API |
| `pnpm --dir artifacts/etl-dashboard run dev` | Run the dashboard with `/api` proxied to `:8080` |
| `pnpm --filter @workspace/db run push` | Push Drizzle schema (dev only; no tables yet) |

## 10. Platform integration (Replit)
`.replit` declares Node 24, an autoscale deployment (`router = "application"`), a `postBuild` step
(`pnpm store prune`), a `postMerge` hook (`scripts/post-merge.sh`), and port mappings
(8080→8080, 8081→80, 19314→3000). `pnpm-workspace.yaml` enforces a **1-day minimum npm release age**
(`minimumReleaseAge: 1440`) as a supply-chain defence, with an allowlist for `@replit/*`.

## 11. Operational notes
- **Caching** softens AWS/Jira rate limits; tune TTLs via env if data feels stale or APIs throttle.
- **Graceful degradation** — overview/costs/incidents endpoints return empty/zeroed payloads on
  upstream failure instead of erroring the page.
- **Logs** — backend emits structured JSON to stdout; `startup.sh` tees to `logs/`.
- **Health/readiness** — `/healthz` and `/readyz` for load-balancer and container probes.
- **ALB idle timeout** — the load balancer defaults to **60s** and is not set in the CloudFormation
  template. The AI-agent path can exceed it (→ `504 Gateway Timeout`), so raise it once per ALB with
  `aws elbv2 modify-load-balancer-attributes --load-balancer-arn <arn> --attributes "Key=idle_timeout.timeout_seconds,Value=300"`.
  It persists across `deploy.sh` re-runs but is reset if the stack is recreated.
