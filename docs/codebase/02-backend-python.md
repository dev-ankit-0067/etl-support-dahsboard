# 02 · Backend — FastAPI (`aws-backend`)

The **primary, production backend**. A Python 3.12 FastAPI service that pulls live data from AWS and
Jira, runs AI agents against CloudWatch logs, caches responses, and serves JSON matching the
dashboard's contracts.

## Technology

| Concern | Library |
|---------|---------|
| Web framework | FastAPI 0.115 |
| ASGI server | uvicorn 0.32 (dev) / gunicorn 23 + `uvicorn.workers.UvicornWorker` (prod) |
| AWS SDK | boto3 / botocore 1.35 |
| Config | pydantic 2.10 + pydantic-settings 2.6 |
| Caching | cachetools 5.5 (`TTLCache`) |
| Logging | python-json-logger 2.0 |
| Incidents | `jira` 3.10 |
| AI agents | huggingface_hub, langchain, langchain-huggingface |
| Auth | `PyJWT[crypto]` — Cognito JWT verification |

## Directory layout

```
aws-backend/
├── app/
│   ├── __init__.py            # __version__ = "1.0.0"
│   ├── main.py                # App factory, router wiring, exception handlers
│   ├── config.py              # Settings (pydantic-settings) + get_settings()
│   ├── auth.py                # Cognito JWT verification (require_auth dependency)
│   ├── aws.py                 # Cached boto3 client factory
│   ├── cache.py               # TTL cache decorator (short/medium/long buckets)
│   ├── logging_config.py      # Structured JSON logging
│   ├── models/                # Pydantic response models (camelCase fields)
│   ├── routers/               # HTTP route handlers (thin)
│   └── services/              # Business logic + AWS/Jira/LLM integration
├── requirements.txt
├── Dockerfile
├── gunicorn_conf.py
├── iam-policy.json            # Least-privilege IAM policy the service needs
└── .env.example
```

Architectural pattern: **routers are thin** (validate input, delegate, map exceptions); **services
hold all logic** (AWS calls, Jira, LLM, transformations); **models define the response contract**.

---

## Application factory — `app/main.py`

### `create_app() -> FastAPI`
Builds and configures the app:

1. `configure_logging()` then loads `get_settings()`.
2. Instantiates `FastAPI` with title *"ETL Production Support & Cost Insights API"*, version from
   `__version__`, Swagger UI at `/docs`, OpenAPI JSON at `/openapi.json` (ReDoc disabled).
3. Adds `CORSMiddleware` with `allow_origins = settings.cors_allow_origins`, methods
   `GET/POST/OPTIONS`, credentials allowed.
4. Registers routers:
   - `health.router` at the **root** (`/healthz`, `/readyz`) — public.
   - `meta.router` under `/api` (`/api/config`) — public (the SPA needs it before login).
   - The data routers under `settings.api_prefix` (default `/api`) — `overview`, `pipelines`,
     `lambdas`, `emr`, `emr_serverless`, `incidents`, `costs`, `rca`, `cloudwatch`, `agents`,
     `s3_logs` — each included with `dependencies=[Depends(require_auth)]`, so a valid Cognito token
     is required when auth is configured (see [Authentication](#authentication--appauthpy)).
5. Registers three global exception handlers (see below).
6. Module-level `app = create_app()` is the ASGI entrypoint (`app.main:app`).

### Exception handlers
| Handler | Trigger | Result |
|---------|---------|--------|
| `_client_error` | boto3 `ClientError` | 502 for `ThrottlingException`/`RequestLimitExceeded`, else 500; body `{error: <code>, message}` |
| `_botocore_error` | `BotoCoreError` (connectivity) | 502 `{error: "AWSConnectivity", message}` |
| `_unhandled` | any `Exception` | 500 `{error: "InternalServerError", message}` (logs traceback) |

---

## Configuration — `app/config.py`

### `class Settings(BaseSettings)`
Loads from environment / `.env` (case-insensitive, extra ignored). Groups:

- **App:** `app_name`, `app_env` (dev/staging/production), `log_level`, `api_prefix` (`/api`),
  `cors_allow_origins` (default `["*"]`).
- **AWS:** `aws_region` (`us-east-1`), optional `aws_profile`, explicit
  `aws_access_key_id`/`secret`/`session_token` (else default credential chain), and boto retry/
  timeout knobs (`boto_max_attempts=6`, `boto_retry_mode="standard"`, connect=5s, read=30s).
- **Caching:** `cache_ttl_short=30`, `cache_ttl_medium=300`, `cache_ttl_long=1800`,
  `cache_maxsize=1024` (seconds).
- **Remote (S3) runtime config:** `config_s3_bucket` + `config_s3_key` (env `CONFIG_S3_BUCKET` /
  `CONFIG_S3_KEY`, no defaults) point at an optional JSON document in S3 that **overrides**
  `incident_provider`, `project_tag_key`/`project_values` and per-project S3 log paths at runtime;
  `config_refresh_seconds` (default 60) controls the re-fetch TTL. Falls back to env values when
  absent/unreachable. See `app/remote_config.py` and `config.example.json` for the schema.
- **Domain filters:** `glue_job_name_filter`, `cost_explorer_tag_key` (`CostCenter`),
  `sla_breach_minutes=60`.
- **EMR log groups:** `emr_log_group` (EMR-on-EC2, no default), `emr_serverless_log_group`
  (default `/aws/emr-serverless`).
- **S3 log source:** `s3_log_bucket` (env `S3_LOG_BUCKET`, no default) — bucket holding custom logs
  at `s3://<bucket>/<project>/<run-id>.log`. Per-project prefixes (`s3LogPath` in the remote config
  document) override the legacy `<project>/` layout; the walker descends through any sub-folders to
  the `.log` files.
- **HuggingFace (LLM):** `huggingface_api_token`, `huggingface_model`
  (`Qwen/Qwen2.5-72B-Instruct`, used by the agentic tool-calling agent).
- **Incident provider:** `incident_provider` (`jira` | `servicenow`, default `jira`; env
  `INCIDENT_PROVIDER`) — selects which MCP server the backend spawns for incidents/RCA/ticket
  creation. Overridable at runtime via `"incidentProvider"` in the remote config document.
- **Jira** (when `INCIDENT_PROVIDER=jira`): `jira_url`, `jira_username`, `jira_api_token`,
  `jira_project_key` (`SCRUM`), `use_jira_incidents=True`, `jira_issue_type` (`Bug`), plus
  `jira_status_mapping` and `jira_priority_mapping` dictionaries used to translate Jira
  states/priorities into the dashboard's incident status and P1–P4 severity.
- **ServiceNow** (when `INCIDENT_PROVIDER=servicenow`): `servicenow_instance`, `servicenow_user`,
  `servicenow_password` (basic auth), `servicenow_table` (`incident`), `servicenow_project_field`
  (`u_project`, empty disables project filtering), plus `servicenow_status_mapping` /
  `servicenow_priority_mapping` (state/priority → status/severity).
- **Cognito (auth):** `cognito_user_pool_id`, `cognito_client_id`, `cognito_region` (defaults to
  `aws_region`). When the pool + client are set, API auth is enforced; when unset, the API runs
  open (local-dev mode).

### `get_settings() -> Settings`
`@lru_cache(maxsize=1)` — a process-wide singleton settings instance.

---

## AWS client factory — `app/aws.py`

- `_boto_config()` → a botocore `Config` with region, retries, timeouts, and a
  `user_agent_extra` of `"{app_name}/{app_env}"`.
- `_session()` → a boto3 `Session` chosen by precedence: **profile** → **explicit keys** →
  **default credential chain** (env vars, IAM role, IRSA, etc.).
- `client(service_name)` → `@lru_cache(maxsize=32)` cached boto3 client per service.
- `reset_clients()` → clears the client cache (test helper).

---

## Caching — `app/cache.py`

Thread-safe TTL caching over three `cachetools.TTLCache` buckets:

- `short` (30 s) — live status, runs, logs.
- `medium` (300 s) — KPIs, distributions, history.
- `long` (1800 s) — Cost Explorer aggregates.

### `cached(bucket="medium")`
Decorator factory. Wraps a sync function; the cache key is
`(fn.__qualname__, args, sorted(kwargs))`, guarded by a module-level `Lock`. Attaches a
`.cache_clear()` to the wrapped function. `clear_all()` empties every bucket.

---

## Logging — `app/logging_config.py`

### `configure_logging()`
Clears root handlers, adds a stdout `StreamHandler` with a `jsonlogger.JsonFormatter` (renames
`asctime`→`timestamp`, `levelname`→`level`), sets level from `settings.log_level`, and quiets noisy
`botocore`/`urllib3`/`boto3`/`s3transfer` loggers to WARNING.

---

## Routers — `app/routers/`

Each router is a thin FastAPI `APIRouter` with a prefix and tag. Endpoints below are relative to
`/api` (except health). Full request/response detail is in [06-api-reference.md](./06-api-reference.md).

### `health.py` — root, tag `health` (public)
- `GET /healthz` → `{status: "ok", version}`
- `GET /readyz` → `{status: "ready"}`

### `meta.py` — `/config` & `/projects`, tag `meta` (public)
- `GET /config` → `{ cognito: { userPoolId, clientId, region } }` — runtime config the SPA reads
  before login. Values come from settings; `null` when Cognito isn't configured.
- `GET /projects` → `{ tagKey, projects: ["all", ...project_value_list], labels }` — options for the
  project dropdown (from the remote config's `projects[].value`, `PROJECT_VALUES` fallback). `labels`
  maps each project value to its custom S3 log-source label (`projects[].s3LogLabel`) for the UI.

## Project tag filtering

The project dropdown filters all data by an AWS resource **tag** (`project_tag_key`, default `project`)
without threading a parameter through every function:

- **`context.py`** — `current_project: ContextVar[Optional[str]]`. Per-request, a **pure-ASGI**
  `ProjectContextMiddleware` (in `main.py`) sets it from the **`X-Project`** header (`None` when the
  header is absent or `all`). Pure ASGI (not `BaseHTTPMiddleware`) so the contextvar is visible in
  the sync endpoints that run in the threadpool.
- **`cache.py`** — the `cached` key now includes `current_project.get()`, so cached results are
  **scoped per project** automatically.
- **`services/tags_service.py`** — `arns_for_project(project)` (`@cached`) resolves the set of
  resource ARNs tagged `project=<value>` via the **Resource Groups Tagging API** (`get_resources`);
  `project_arns()` returns that set for the active project or `None` when unfiltered; `account_id()`
  is cached via STS.
- **Service filtering:** each resource service intersects its list with `project_arns()` when set —
  Glue (job ARN), Lambda (`FunctionArn`), EMR (cluster ARN), EMR Serverless (application `arn`). Cost
  Explorer merges a `{Tags:{Key,Values}}` filter into each `get_cost_and_usage` (`And`-combined with
  existing filters). Jira is best-effort: an extra JQL `labels = "<project>"` clause.
- **Config:** `project_tag_key` (`project`), `project_values` (CSV string → `project_value_list`).
- **IAM:** adds `tag:GetResources` / `GetTagKeys` / `GetTagValues` (in `iam-policy.json` + deploy role).

### `overview.py` — `/overview`, tag `overview`
Composes Glue + incident data for the Executive Overview page.
- `GET /overview/kpis` → `OverviewKpis`. Pulls jobs, live status, recent failures from
  `glue_service`; incident counts from `incidents_service`. Derives `healthy/degraded/failed`,
  `slaCompliancePercent = healthy/total*100`. Degrades gracefully to zeros if Glue/incidents fail.
- `GET /overview/health-distribution` → `HealthDistribution`. Buckets `glue_service.recent_runs()`
  by domain into healthy/degraded/failed.
- `GET /overview/job-status-trend` → `List[JobStatusPoint]` (hourly buckets, from Glue).
- `GET /overview/failed-jobs` → `List[FailedJob]`.
- `GET /overview/active-incidents` → `List[ActiveIncident]` (from Jira records; `acknowledged`
  derived from status not in Open/Investigating).

### `pipelines.py` — `/pipelines`, tag `pipelines`
- `GET /pipelines/live` → `LiveStatus`
- `GET /pipelines/runs` → `List[PipelineRun]`
- `GET /pipelines/history/{pipeline_name}` → `List[PipelineHistoryItem]`

### `lambdas.py` — `/lambdas`, tag `lambdas`
- `GET /lambdas/kpis` → `LambdaKpis`
- `GET /lambdas/runs` → `List[LambdaInvocation]`
- `GET /lambdas/history/{function_name}` → `List[PipelineHistoryItem]` (invocations parsed from logs)

### `emr.py` — `/emr`, tag `emr`
- `GET /emr/runs` → `List[PipelineRun]` (clusters) · `GET /emr/history/{cluster}` →
  `List[PipelineHistoryItem]` (steps). Backed by `emr_service`.

### `emr_serverless.py` — `/emr-serverless`, tag `emr-serverless`
- `GET /emr-serverless/runs` → `List[PipelineRun]` (applications) ·
  `GET /emr-serverless/history/{application}` → `List[PipelineHistoryItem]` (job runs). Backed by
  `emr_serverless_service`.

### `incidents.py` — `/incidents`, tag `incidents`
Backed by `incidents_service` (the MCP-based provider — Jira/ServiceNow; import guarded, routes 500
cleanly on failure).
- `GET /incidents/summary` → `IncidentSummary`
- `GET /incidents/mttr-trend` → `List[MttrTrendPoint]` (**returns `[]`** — not implemented)
- `GET /incidents/distribution` → `List[IncidentDistributionItem]` (**returns `[]`**)
- `GET /incidents/list` → `List[IncidentRecord]`

### `s3_logs.py` — `/s3` + `/logs/s3`, tag `s3`
Custom S3 log source. Backed by `s3_logs_service`.
- `GET /s3/runs` → log objects under `s3://<bucket>/<project>/` as run records (project-scoped).
- `GET /logs/s3/{identifier}` → the lines of a single `<identifier>.log` object.

### `costs.py` — `/costs`, tag `costs`
- `GET /costs/kpis` → `CostKpis`
- `GET /costs/breakdown` → `CostBreakdown`
- `GET /costs/performance` → `CostPerformance`
- `GET /costs/service-trend` → `ServiceTrend`

### `rca.py` — `/rca`, tag `rca`
Jira-backed (guarded import).
- `GET /rca/lifecycle` → `RcaLifecycle`
- `GET /rca/repeat-incidents` → `List[RepeatIncident]`

### `cloudwatch.py` — `/logs`, tag `logs`
- `GET /logs/job/{job_id}?limit=1..1000` → Glue job log events
- `GET /logs/lambda/{function_name}?limit=1..1000` → Lambda log events
- `GET /logs/emr/{cluster_id}?limit=1..1000` → EMR-on-EC2 cluster/step log events
- `GET /logs/emr-serverless/{job_run_id}?limit=1..1000` → EMR Serverless job-run log events

### `agents.py` — `/agents`, tag `agents`  *(the only agent router; wired into `main.py`)*
Fully agentic LangChain endpoint — used by every AI button in the UI.
- `POST /agents/analyze` with body `AgentRequest{ log_id, type: "log"|"jira", resource_type }` →
  `AgentResponse{ log_id, type, analysis, jira_key? }`. `resource_type` ∈
  `job|lambda|emr|emr_serverless|s3`.
  - `type="log"` → `agent_service.run_log_analysis_agent(log_id, resource_type)`
  - `type="jira"` → `agent_service.run_jira_creation_agent(log_id, resource_type)`

---

## Authentication — `app/auth.py`

Cognito JWT verification applied to every protected API route.

- `auth_enabled()` — true when `cognito_user_pool_id` **and** `cognito_client_id` are set.
- `_jwks_client(region, pool_id)` — `@lru_cache`d `PyJWKClient` for the pool's
  `.../.well-known/jwks.json` (fetches + caches the signing keys).
- `_verify(token)` — decodes with `PyJWT` (RS256), validating **signature, expiry, and issuer**;
  then checks the audience per token type — ID tokens must have `aud == client_id`, access tokens
  `client_id == client_id` (rejects any other `token_use`).
- `require_auth(creds=Depends(HTTPBearer(auto_error=False)))` — the FastAPI dependency:
  - **open mode** (auth not configured) → returns `None`, allowing the request;
  - otherwise a missing/invalid/expired token → **401** (`WWW-Authenticate: Bearer`); a valid token
    → returns the decoded claims.

Wired in `main.py` on the eight data routers; `/healthz` and `/api/config` stay public. The SPA
sends the Cognito **ID token** as the bearer (see [04-frontend.md](./04-frontend.md#authentication)).

## Services — `app/services/`

### `glue_service.py` — AWS Glue pipeline data
Maps Glue job runs into the dashboard's pipeline shapes.

**Helpers/constants:**
- `_RUN_STATUS_MAP` — Glue `JobRunState` → UI status (`SUCCEEDED`→`Success`, `FAILED`→`Failed`,
  `TIMEOUT`→`Timed Out`, `RUNNING`/`STARTING`/`STOPPING`→`Running`, `WAITING`→`Waiting`,
  `STOPPED`→`Failed`).
- `_GLUE_DPU_HOUR_USD = 0.44` — approximate DPU-hour price for cost estimates.
- `_fmt_duration(seconds)`, `_iso(dt)`, `_domain_from_name(name)` (prefix→domain map:
  fin→Finance, mkt→Marketing, sc→Supply Chain, …), `_cost_per_run(run)` (DPU-seconds × price).

**Public functions (all `@cached`):**
| Function | Bucket | Returns | Notes |
|----------|--------|---------|-------|
| `list_jobs()` | medium | `List[dict]` | Paginates `get_jobs`; applies `glue_job_name_filter`. |
| `list_recent_runs(max_per_job=5)` | short | `List[dict]` | Flattens `get_job_runs` per job; tags each with `_jobName`. |
| `live_status()` | short | `LiveStatus` | Counts running/failed/timedOut/waiting; flags `delayed` when a running job exceeds `sla_breach_minutes`. |
| `recent_runs()` | short | `List[PipelineRun]` | Builds run rows with duration, owner (`WorkerType`), domain, cost. |
| `history_for(job_name, limit=20)` | medium | `List[PipelineHistoryItem]` | Per-job run history incl. `recordsProcessed` from job args. |
| `hourly_status_trend(hours=24)` | medium | `List[JobStatusPoint]` | 24 hourly buckets of success/failed/running. |
| `recent_failed_jobs(limit=10)` | medium | `List[FailedJob]` | Sorted by completion; severity P1 for TIMEOUT else P2. |

### `lambda_service.py` — Lambda + CloudWatch metrics
Derives Lambda health/cost from CloudWatch metrics.

**Constants/helpers:** `_PRICE_PER_REQUEST`, `_PRICE_PER_GB_SECOND` (us-east-1 x86 on-demand);
`_metric_sum(name, fn, period)`
and `_metric_avg(...)` (CloudWatch `get_metric_statistics` over `AWS/Lambda`);
`_cost_per_invocation(memory_mb, avg_ms)`; `_fmt_duration(ms)`; `_status(errors, throttles,
invocations)`; `_logs_latest_invocation(fn)` (reads the newest CloudWatch log stream for
start/end timestamps).

**Public functions:**
| Function | Bucket | Returns |
|----------|--------|---------|
| `list_functions()` | medium | all Lambda functions, **newest-first by `LastModified`** (filtered by the `project` tag when selected) |
| `kpis()` | medium | `LambdaKpis` — totals, healthy/withErrors, throttles, avg duration, cold-start %, 24h invocations |
| `recent_invocations(limit=12)` | short | `List[LambdaInvocation]` |
| `history_for(function_name, limit=10)` | short | `List[PipelineHistoryItem]` — groups CloudWatch log events by `RequestId` (`START`/`REPORT` markers; `Failed` on error/timeout/traceback) |

### `costs_service.py` — AWS Cost Explorer / Budgets
**Helpers:** `_ce_client()`, `_today()`, `_month_start()`, `_fetch_grouped(...)`,
`_trend(days)`, `_trend_by_service(days, service)`.

**Public functions (all `@cached("long")`):**
| Function | Returns | Notes |
|----------|---------|-------|
| `kpis()` | `CostKpis` | MTD unblended cost (MONTHLY), budget from `budgets.describe_budgets` (account via STS), `costOfFailedRuns` ≈ 8% heuristic, derived `avgCostPerRun`. |
| `breakdown(top_n=10)` | `CostBreakdown` | Cost grouped by the `cost_explorer_tag_key` tag, top-N pipelines. |
| `performance()` | `CostPerformance` | 7-day and 30-day daily trends + `costRanges` map. |
| `service_trend()` | `ServiceTrend` | Per-service (Glue, Lambda, combined) daily trends over 7/30/60/90-day windows. |

### `emr_service.py` — EMR-on-EC2 (clusters + steps)
- `recent_runs()` `@cached("short")` → `List[PipelineRun]`, one per cluster from `emr.list_clusters`
  (row `id` = cluster id; state mapped to Running/Success/Failed).
- `history_for(cluster)` `@cached("medium")` → `List[PipelineHistoryItem]` from `emr.list_steps`
  (resolves cluster name→id; history item `id` = **cluster id**, the identifier used for log lookups).

### `emr_serverless_service.py` — EMR Serverless (applications + job runs)
- `recent_runs()` `@cached("short")` → `List[PipelineRun]`, one per application from
  `emr-serverless.list_applications` (status from its latest `list_job_runs`).
- `history_for(application)` `@cached("medium")` → `List[PipelineHistoryItem]` from `list_job_runs`
  (history item `id` = **job run id**, used for log lookups).

> These add read IAM (`elasticmapreduce:ListClusters/DescribeCluster/ListSteps/DescribeStep`,
> `emr-serverless:ListApplications/GetApplication/ListJobRuns/GetJobRun`) — added to
> `iam-policy.json` and the deploy task role. Cost isn't available from these APIs (`costPerRun` = 0).

### `cloudwatch_service.py` — CloudWatch Logs
Fetches raw log events for Glue jobs, Lambdas, and EMR (on-EC2 + Serverless).
- `_get_log_group_for_job(job_id)` → `"/aws-glue/jobs/output"` (standard Glue output group).
- `_get_log_group_for_lambda(fn)` → `"/aws/lambda/{fn}"`.
- `get_job_logs(job_id, limit=1000)` `@cached("short")` — filters streams by `job_id` prefix,
  collects/sorts events, returns `{jobId, logGroup, events[], eventCount, timestamp}` (or an
  `error`/`message` envelope). *(Contains `print()` debug statements.)*
- `get_lambda_logs(function_name, limit=100)` `@cached("short")` — reads the 5 most recent streams,
  returns the same envelope keyed by `functionName`.
- `_fetch_group_by_identifier(log_group, identifier, id_key, limit)` — shared EMR helper: matches
  streams by name **prefix** first, then falls back to recent streams whose name **contains** the
  identifier (EMR nests the id inside the stream path); returns the standard envelope.
- `get_emr_logs(cluster_id, limit=1000)` `@cached("short")` — reads `settings.emr_log_group`
  (returns a "not configured" message if unset), keyed by `clusterId`.
- `get_emr_serverless_logs(job_run_id, limit=1000)` `@cached("short")` — reads
  `settings.emr_serverless_log_group` (default `/aws/emr-serverless`), keyed by `jobRunId`.

> **CloudWatch-only** by design: EMR logs are read from CloudWatch log groups (like Glue/Lambda), so
> no EMR/EMR-Serverless API calls and **no new IAM** beyond the existing `logs:DescribeLogStreams` /
> `logs:GetLogEvents`. Set `EMR_LOG_GROUP` (and optionally `EMR_SERVERLESS_LOG_GROUP`) to point at
> the groups where your clusters/jobs ship logs.

### `s3_logs_service.py` — custom S3 log source
Reads logs from S3 (not CloudWatch). Per-project prefixes come from the remote config document
(`projects[].s3LogPath` / optional `s3LogBucket` — see `remote_config.py`); without remote config it
falls back to the legacy `s3://<S3_LOG_BUCKET>/<project>/<run-id>.log` layout. The project is the
active project tag value (X-Project header via `tags_service.active_project()`).
- `list_runs(limit=500)` `@cached("short")` — lists `.log` objects under the active project's
  prefix(es) (every configured project prefix when project is `all`), **descending iteratively
  through sub-folders** (`_iter_log_objects`, `Delimiter="/"`, depth-capped at 20) until files are
  reached; returns `{id, runId, project, lastModified, sizeBytes}[]` sorted newest-first. `id` is the
  object key without `.log` (e.g. `etl-logs/poc/run-123`).
- `get_logs(identifier, limit=1000)` — resolves the bucket from the matching project prefix
  (`remote_config.log_bucket`), reads `<identifier>.log`, returns the standard
  `{key, logGroup, events[], eventCount, timestamp}` envelope (one event per line). Rejects `..`
  (path traversal) and **never raises** — missing bucket/object returns an error envelope so the UI
  degrades gracefully when a tag has no configured S3 path.
- `get_logs_text(identifier, limit=2000)` — the same content as plain text (used by the agent tool).

> Needs `s3:GetObject` / `s3:ListBucket` IAM on the log bucket(s) and the config bucket (already
> granted to the task role via the `S3LogsRead` statement).

### Incidents & RCA — MCP-based provider (Jira **or** ServiceNow)
Incident/RCA data comes from a ticketing backend selected at runtime by
**`INCIDENT_PROVIDER`** (`jira` | `servicenow`, default `jira`), overridable at runtime via
`"incidentProvider"` in the remote S3 config document (`remote_config.incident_provider()`). The
backend is an **MCP client**
that spawns the chosen provider's **MCP server** as a stdio subprocess and calls its tools. All
provider-specific SDK/REST access lives inside the servers; the FastAPI process only aggregates
already-normalized records. Switching providers is a config change — no code change.

```
routers/{incidents,overview,rca}  +  agent_service (create ticket)
        │  (import)
        ▼
services/incidents_service.py   ── provider-agnostic aggregation (summary / list / RCA)
        │  get_provider_client().call("list_incidents"/"create_incident", …)
        ▼
services/mcp_client.py          ── sync↔async bridge; persistent stdio ClientSession per provider
        │  python -m app.mcp_servers.<provider>_server   (subprocess, stdio)
        ▼
app/mcp_servers/jira_server.py        (jira SDK)     ┐  each exposes the SAME two tools returning
app/mcp_servers/servicenow_server.py  (Table API)    ┘  the SAME normalized Incident shape
```

**`app/mcp_servers/` — the MCP servers** (each a standalone `FastMCP` stdio server, runnable via
`python -m app.mcp_servers.<name>`). Both expose two interchangeable tools:
- `list_incidents(project, days) -> list[Incident]`
- `create_incident(summary, description, priority, issue_type, project) -> {id, url}`

where a normalized `Incident` is `{id, title, severity(P1–P4), status(Open/Investigating/Mitigating/
Resolved), pipeline, domain, owner, createdAt, resolvedAt}`.
- **`jira_server.py`** — owns `class JiraClient` (singleton `JIRA` client from `jira_url` + basic
  auth) and the `jira_priority_mapping`/`jira_status_mapping` translation. `list_incidents` runs JQL
  `project = <key> [AND labels = "<project>"] ORDER BY created DESC`. `create_incident` sets the
  issue `labels=[project]` when a project is passed (so the ticket surfaces under that filter).
- **`servicenow_server.py`** — ServiceNow Table API (`/api/now/table/<table>`, basic auth). Maps the
  `incident` table (`number`, `short_description`, `priority`, `state`, `assigned_to`,
  `sys_created_on`, …) onto the same shape via `servicenow_priority_mapping`/`servicenow_status_mapping`;
  filters on `servicenow_project_field`. `create_incident` maps Pn/priority names to ServiceNow 1–5
  and writes the `servicenow_project_field` column when a project is passed.

**`services/mcp_client.py`** — `StdioMcpClient` owns a persistent MCP `ClientSession` on a private
event-loop thread (the subprocess stays up for the worker's life) and exposes a blocking `call(tool,
args)` for the sync service layer. `get_provider_client()` returns a per-provider singleton keyed by
the remote config's provider (env `INCIDENT_PROVIDER` fallback).

**`services/incidents_service.py`** — provider-agnostic aggregation over the normalized records:
- `_fetch(days=30)` `@cached("short")` — calls `list_incidents` with the active project.
- `list_records(limit=50)` → `List[IncidentRecord]`; `summary()` → `IncidentSummary` (open,
  resolved-24h, P1/P2/P3); `create_ticket(...)` → id/key/number. `create_ticket` reads the active
  project (`tags_service.active_project()`, from the `X-Project` header) and passes it to the MCP
  `create_incident` tool — tickets are tagged with the selected project (Jira label / ServiceNow
  project field); when "all" is selected, no tag is set.
- `rca_lifecycle(days=30)` / `rca_repeat_incidents(days=30, top_n=10)` `@cached("medium")` — average
  resolution time as the "Resolve" stage; pipelines with ≥2 incidents.

---

## Ticket mappings (database)

When the ticket flow (`run_jira_creation_agent`, `type="jira"`) returns a ticket key, the
log → incident association is persisted so the Executive Overview can link each log row to its
ticket:

- **`app/database.py`** — SQLAlchemy engine/session. `DATABASE_URL` (env, default
  `sqlite:///./opsguardian.db`) — SQLite out of the box, Postgres/any SQLAlchemy backend via a
  config change. Tables are created at startup (`init_db()` in `create_app`); SQLite runs in WAL
  mode with a busy timeout for the gunicorn workers.
- **`app/models/ticket_mapping.py`** — `log_ticket_mappings` table: `id`, `log_id` (indexed),
  `incident_id`, `provider` (`jira`/`servicenow`), `ticket_url`, `resource_type`, `project`,
  `created_at`; unique on `(log_id, incident_id)`.
- **`app/services/ticket_mapping_service.py`** — `record_ticket(...)` (idempotent upsert; builds a
  best-effort ticket URL from the provider settings; never raises — recording failure can't break
  ticket creation) and `get_mappings(log_ids=None)` (latest mapping per log id).
- **`app/routers/ticket_mappings.py`** — `GET /api/ticket-mappings` (auth-protected; optional
  `?log_ids=...` filter) → `{ mappings: {log_id: {...}} }`, consumed by the Executive Overview S3
  log table (Ticket column with hyperlink).

> Note: the SQLite file lives in the container working dir and is **ephemeral** — mappings reset on
> task restarts. Set `DATABASE_URL` to Postgres for durable storage.

## AI agents

A single HuggingFace-backed **LangChain tool-calling agent**. Every AI button in the UI routes to it
via `/api/agents/analyze` (see [04-frontend.md](./04-frontend.md#ai-button--endpoint--agent-mapping)):

| Frontend button | Endpoint | Router | Service |
|-----------------|----------|--------|---------|
| Row **Get RCA** / **Log ticket** | `POST /api/agents/analyze` | `routers/agents.py` | `agent_service.py` |
| Log-viewer **RCA Analysis** | `POST /api/agents/analyze` `{type:"log"}` | `routers/agents.py` | `agent_service.py` |
| Log-viewer **Log ticket** | `POST /api/agents/analyze` `{type:"jira"}` | `routers/agents.py` | `agent_service.py` |

> The old single-shot log-text-in service (`routers/agent.py` → `services/agent.py`, `/api/agent/*`)
> was unmounted dead code and has been removed.

### `services/agent_service.py` — tool-calling LangChain agent
- **Tools:** `@tool fetch_cloudwatch_logs(job_id)` (Glue), `@tool fetch_lambda_logs(function_name)`
  (Lambda), `@tool fetch_emr_logs(cluster_id)` (EMR-on-EC2), `@tool
  fetch_emr_serverless_logs(job_run_id)` (EMR Serverless), `@tool fetch_s3_logs(run_id)` (custom S3
  log via `s3_logs_service`) — plus `@tool create_incident_ticket(summary, description, priority)`
  (wraps `incidents_service.create_ticket`, routed to Jira **or** ServiceNow per `INCIDENT_PROVIDER`;
  the active project from the `X-Project` header is passed through so the ticket is tagged with it).
  `_log_tool(resource_type)` / `_resource_label(resource_type)`
  select the tool + prompt label via the `_LOG_TOOLS` / `_RESOURCE_LABELS` maps.
- `_get_chat_model()` — `ChatHuggingFace(HuggingFaceEndpoint(repo_id=huggingface_model,
  task="conversational", max_new_tokens=4096, temperature=0.1))`.
- **System prompts:** `_LOG_ANALYSIS_SYSTEM` (structured RCA format with Summary/Severity/Root
  Cause/Affected Component/Remediation/Details) and `_JIRA_CREATION_SYSTEM` (analyse then open a
  ticket with a severity→priority mapping).
- `run_log_analysis_agent(log_id, resource_type="job")` — builds an agent with the resource-appropriate
  logs tool, returns `{log_id, type:"log", analysis, jira_key:None}`.
- `run_jira_creation_agent(log_id, resource_type="job")` — agent with the logs tool + create-ticket
  tool; extracts the created id/key from the `ToolMessage` for `create_incident_ticket`; returns
  `{..., type:"jira", analysis, jira_key}` (response field names kept for API stability; the ticket
  is created in whichever provider `INCIDENT_PROVIDER` selects).
- `resource_type` ∈ `"job"` (Glue run id) · `"lambda"` (Lambda function name) · `"emr"` (EMR-on-EC2
  cluster/step id) · `"emr_serverless"` (EMR Serverless job run id) · `"s3"` (S3 log identifier).

Surfaced through **`routers/agents.py`** (`POST /agents/analyze`).

The structured RCA format is what the frontend's `LogAnalysisModal.parseSections()` renders into
labelled section cards. See also [agents-api.md](./agents-api.md).

---

## Models — `app/models/` (Pydantic response contracts)

All fields are **camelCase** to match the frontend. Summary of each module:

- **`overview.py`** — `OverviewKpis`, `DomainHealth`, `HealthDistribution`, `JobStatusPoint`,
  `FailedJob`, `ActiveIncident`.
- **`pipelines.py`** — `LiveStatus`, `PipelineRun`, `PipelineHistoryItem`.
- **`lambdas.py`** — `LambdaKpis`, `LambdaInvocation`.
- **`incidents.py`** — `IncidentSummary`, `MttrTrendPoint`, `IncidentDistributionItem`,
  `IncidentRecord`, `IncidentList`.
- **`costs.py`** — `CostKpis`, `CostByPipeline`, `CostBreakdown`, `CostTrendPoint`,
  `CostPerformance`, `ServiceTrendSeries` (aliases `lambda_`→`lambda`), `ServiceTrend` (aliases
  `ranges_7d`→`7d`, etc.).
- **`rca.py`** — `LifecycleStage`, `RcaLifecycle`, `RepeatIncident`.
- **`agent.py`** — `LogAnalysisRequest`/`Response`, `JiraTicketRequest`/`Response`.

Exact field lists are in [06-api-reference.md](./06-api-reference.md).

---

## Notable implementation details / gotchas

- `config.py` declares `huggingface_api_token` **twice** and still defines a leftover
  `huggingface_model_name` alongside the active `huggingface_model` (only the latter is used now).
- `incidents` MTTR-trend and distribution endpoints are intentional stubs returning `[]`.
- `cloudwatch_service.get_job_logs` hard-codes the Glue output log group and includes `print()`
  debug output.
- Everything degrades gracefully: overview/costs/incidents routes catch service failures and return
  empty/zeroed payloads rather than 500-ing the whole page.
