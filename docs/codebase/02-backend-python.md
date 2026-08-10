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
     `lambdas`, `incidents`, `costs`, `rca`, `cloudwatch`, `agents` — each included with
     `dependencies=[Depends(require_auth)]`, so a valid Cognito token is required when auth is
     configured (see [Authentication](#authentication--appauthpy)).
   - *(Note: `routers/agent.py` — the `/agent/*` HuggingFace + Jira routes the frontend actually
     calls — exists and is fully implemented but is not auto-included in `main.py`'s list; it is
     the log-text-in / RCA-out variant. `routers/agents.py` — the fully agentic job-ID variant — is
     the one wired in.)*
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
- **Domain filters:** `glue_job_name_filter`, `lambda_function_tag_key`/`value`,
  `cost_explorer_tag_key` (`CostCenter`), `sla_breach_minutes=60`.
- **HuggingFace (LLM):** `huggingface_api_token`, `huggingface_model`
  (`Qwen/Qwen2.5-72B-Instruct`, used by the agentic tool-calling agent) and
  `huggingface_model_name` (`meta-llama/Llama-3.1-8B-Instruct`, used by the log-text analysis
  service).
- **Jira:** `jira_url`, `jira_username`, `jira_api_token`, `jira_project_key` (`SCRUM`),
  `use_jira_incidents=True`, `jira_issue_type` (`Bug`), plus `jira_status_mapping` and
  `jira_priority_mapping` dictionaries used to translate Jira states/priorities into the
  dashboard's incident status and P1–P4 severity.
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

### `meta.py` — `/config`, tag `meta` (public)
- `GET /config` → `{ cognito: { userPoolId, clientId, region } }` — runtime config the SPA reads
  before login. Values come from settings; `null` when Cognito isn't configured.

### `overview.py` — `/overview`, tag `overview`
Composes Glue + Jira data for the Executive Overview page.
- `GET /overview/kpis` → `OverviewKpis`. Pulls jobs, live status, recent failures from
  `glue_service`; incident counts from `jira_service`. Derives `healthy/degraded/failed`,
  `slaCompliancePercent = healthy/total*100`. Degrades gracefully to zeros if Glue/Jira fail.
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

### `incidents.py` — `/incidents`, tag `incidents`
Backed by Jira (import guarded — if `jira_service` import fails the routes 500 cleanly).
- `GET /incidents/summary` → `IncidentSummary`
- `GET /incidents/mttr-trend` → `List[MttrTrendPoint]` (**returns `[]`** — not implemented)
- `GET /incidents/distribution` → `List[IncidentDistributionItem]` (**returns `[]`**)
- `GET /incidents/list` → `List[IncidentRecord]`

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
- `GET /logs/job/{job_id}?limit=1..1000` → job log events
- `GET /logs/lambda/{function_name}?limit=1..1000` → lambda log events

### `agents.py` — `/agents`, tag `agents`  *(wired into `main.py`)*
Fully agentic LangChain endpoint.
- `POST /agents/analyze` with body `AgentRequest{ log_id, type: "log"|"jira" }` →
  `AgentResponse{ log_id, type, analysis, jira_key? }`.
  - `type="log"` → `agent_service.run_log_analysis_agent(log_id)`
  - `type="jira"` → `agent_service.run_jira_creation_agent(log_id)`

### `agent.py` — `/agent`, tag `agent`  *(the routes the current UI calls)*
Log-text-in variant used by `CloudWatchLogViewer`.
- `POST /agent/analysis` with `LogAnalysisRequest` → `LogAnalysisResponse` (RCA text + model name).
  Delegates to `services/agent.analyze_log_text()`.
- `POST /agent/jira` with `JiraTicketRequest` → `JiraTicketResponse{ issueKey, issueUrl?, summary }`.
  Builds a summary/description (optionally appends the RCA), calls
  `services/agent.create_jira_issue()`, and constructs the browse URL from `jira_url`.

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
`_matches_tag(tags)` (filters by `lambda_function_tag_key/value`); `_metric_sum(name, fn, period)`
and `_metric_avg(...)` (CloudWatch `get_metric_statistics` over `AWS/Lambda`);
`_cost_per_invocation(memory_mb, avg_ms)`; `_fmt_duration(ms)`; `_status(errors, throttles,
invocations)`; `_logs_latest_invocation(fn)` (reads the newest CloudWatch log stream for
start/end timestamps).

**Public functions:**
| Function | Bucket | Returns |
|----------|--------|---------|
| `list_functions()` | medium | tagged Lambda functions |
| `kpis()` | medium | `LambdaKpis` — totals, healthy/withErrors, throttles, avg duration, cold-start %, 24h invocations |
| `recent_invocations(limit=12)` | short | `List[LambdaInvocation]` |

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

### `cloudwatch_service.py` — CloudWatch Logs
Fetches raw log events for jobs and Lambdas.
- `_get_log_group_for_job(job_id)` → `"/aws-glue/jobs/output"` (standard Glue output group).
- `_get_log_group_for_lambda(fn)` → `"/aws/lambda/{fn}"`.
- `get_job_logs(job_id, limit=1000)` `@cached("short")` — filters streams by `job_id` prefix,
  collects/sorts events, returns `{jobId, logGroup, events[], eventCount, timestamp}` (or an
  `error`/`message` envelope). *(Contains `print()` debug statements.)*
- `get_lambda_logs(function_name, limit=100)` `@cached("short")` — reads the 5 most recent streams,
  returns the same envelope keyed by `functionName`.

### `jira_service.py` — Jira-backed incidents & RCA
- **`class JiraClient`** — singleton wrapper. `get_client()` lazily builds a `JIRA` client from
  `jira_url` + basic auth (`jira_username`, `jira_api_token`), raising `ValueError` if unconfigured.
- Mapping helpers: `_get_incident_age(created)`, `_map_priority_to_severity(priority)` (via
  `jira_priority_mapping`, default P3), `_map_status_to_incident_status(status)` (via
  `jira_status_mapping`, default Open).
- `list_issues(days=30)` `@cached("short")` — JQL `project = <key> ORDER BY created DESC`.
- `list_records(limit=50)` → `List[IncidentRecord]` — converts issues (owner = assignee,
  pipeline = project name, domain = assignee/issue-type).
- `summary()` → `IncidentSummary` — counts open, resolved-in-24h, and P1/P2/P3.
- `create_ticket(summary, description, priority="Medium", issue_type=None)` → issue key.
- `rca_lifecycle(days=30)` `@cached("medium")` → `RcaLifecycle` (average resolution time as the
  "Resolve" stage; other stages 0 — Jira lacks the granular timeline).
- `rca_repeat_incidents(days=30, top_n=10)` `@cached("medium")` → `List[RepeatIncident]` (pipelines
  with ≥2 incidents, with last-seen + most-recent title as root cause).

---

## AI agents

Two distinct implementations, both HuggingFace-backed. **Which one the frontend actually reaches
depends on which button is pressed** (see [04-frontend.md](./04-frontend.md#ai-button--endpoint--agent-mapping)):

| Frontend button | Endpoint | Router | Service | Wired in `main.py`? |
|-----------------|----------|--------|---------|---------------------|
| Overview row **Get RCA** / **Log Jira ticket** | `POST /api/agents/analyze` | `routers/agents.py` | `agent_service.py` (LangChain, tool-calling) | ✅ Yes |
| Log-viewer **RCA Analysis** | `POST /api/agents/analyze` `{type:"log"}` | `routers/agents.py` | `agent_service.py` | ✅ Yes |
| Log-viewer **Log Jira ticket** | `POST /api/agents/analyze` `{type:"jira"}` | `routers/agents.py` | `agent_service.py` | ✅ Yes |

Every AI button in the UI now routes to the **LangChain agentic workflow** (`/api/agents/analyze`).
The alternative single-shot service (`routers/agent.py` → `services/agent.py`, `/api/agent/*`) is
still present but **not registered in `main.py`**, so it is currently unused.

### `services/agent.py` — single-shot log-text analysis (used by the current UI)
- `ANALYSIS_PROMPT` — a `ChatPromptTemplate` instructing the model to find the root cause and next
  steps.
- `_build_chat_model()` — `ChatHuggingFace(HuggingFaceEndpoint(repo_id=huggingface_model_name,
  task="conversational", max_new_tokens=512, temperature=0.2))`; raises if the token is unset.
- `analyze_log_text(log_text, resource_type, job_id?, job_name?)` → RCA string. Formats the prompt
  with resource label ("Lambda function"/"Glue job") and invokes the model.
- `create_jira_issue(summary, description, issue_type?)` → creates a Jira issue via `JiraClient`
  and returns the issue object.

Surfaced through **`routers/agent.py`** (`POST /agent/analysis`, `POST /agent/jira`).

### `services/agent_service.py` — tool-calling LangChain agent
- **Tools:** `@tool fetch_cloudwatch_logs(job_id)` (Glue job runs, wraps
  `cloudwatch_service.get_job_logs`), `@tool fetch_lambda_logs(function_name)` (Lambda functions,
  wraps `cloudwatch_service.get_lambda_logs`), and `@tool create_jira_ticket(summary, description,
  priority)` (wraps `jira_service.create_ticket`). `_log_tool(resource_type)` picks the Glue vs
  Lambda tool; `_resource_label(resource_type)` labels the identifier in the prompt.
- `_get_chat_model()` — `ChatHuggingFace(HuggingFaceEndpoint(repo_id=huggingface_model,
  task="conversational", max_new_tokens=4096, temperature=0.1))`.
- **System prompts:** `_LOG_ANALYSIS_SYSTEM` (structured RCA format with Summary/Severity/Root
  Cause/Affected Component/Remediation/Details) and `_JIRA_CREATION_SYSTEM` (analyse then open a
  ticket with a severity→priority mapping).
- `run_log_analysis_agent(log_id, resource_type="job")` — builds an agent with the resource-appropriate
  logs tool, returns `{log_id, type:"log", analysis, jira_key:None}`.
- `run_jira_creation_agent(log_id, resource_type="job")` — agent with the logs tool + create-ticket
  tool; extracts the created key from the `ToolMessage` for `create_jira_ticket`; returns
  `{..., type:"jira", analysis, jira_key}`.
- `resource_type` is `"job"` (Glue run id) or `"lambda"` (Lambda function name).

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

- `config.py` declares `huggingface_api_token` **twice** and defines two model settings
  (`huggingface_model` for the agentic agent, `huggingface_model_name` for the single-shot service).
- `routers/agent.py` (the `/agent/*` routes the UI calls) is **not** in `main.py`'s include list,
  while `routers/agents.py` (`/agents/*`) **is**. Verify wiring before relying on either in a new
  deployment.
- `incidents` MTTR-trend and distribution endpoints are intentional stubs returning `[]`.
- `cloudwatch_service.get_job_logs` hard-codes the Glue output log group and includes `print()`
  debug output.
- Everything degrades gracefully: overview/costs/incidents routes catch service failures and return
  empty/zeroed payloads rather than 500-ing the whole page.
