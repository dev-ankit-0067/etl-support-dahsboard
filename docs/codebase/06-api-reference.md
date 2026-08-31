# 06 · API reference

All endpoints are served under **`/api`** (except health, which is at the root on the FastAPI
backend). Fields are **camelCase**. "Backend" indicates which implementation serves the route today:
**FastAPI** = `aws-backend` (started by `startup.sh`, real data), **Express** = `artifacts/api-server`
(mock data). Some contract endpoints exist only on the Express mock.

Legend: ✅ implemented · 🟡 stub returns `[]` · ⚪ mock-only (not in FastAPI)

> **Auth (FastAPI):** when Cognito is configured, all `/api/*` routes **except `/config`** require a
> valid `Authorization: Bearer <Cognito ID token>`; missing/invalid tokens get **401**. `/healthz`,
> `/readyz`, and `/api/config` are always public. See
> [02-backend-python.md → Authentication](./02-backend-python.md#authentication--appauthpy).

---

## Health & meta (public)

| Method | Path | Backend | Response |
|--------|------|---------|----------|
| GET | `/healthz` | FastAPI ✅ | `{ status: "ok", version }` |
| GET | `/healthz` | Express ✅ | `{ status: "ok" }` (validated via `HealthCheckResponse.parse`; no `version`) |
| GET | `/readyz` | FastAPI ✅ | `{ status: "ready" }` |
| GET | `/config` | FastAPI ✅ | `{ cognito: { userPoolId, clientId, region }, incidentProvider, incidentProviderLabel }` — SPA runtime config (pre-login); provider drives incident data + ticket-button labels |
| GET | `/projects` | FastAPI ✅ | `{ tagKey, projects: ["all", ...], labels }` — project dropdown options (from the remote S3 config / `PROJECT_VALUES`) + per-project S3 log-source labels |

> **Project filter:** the SPA sends the selected project as an **`X-Project`** request header. When
> present (and not `all`), the backend filters resources by the `project` tag (Glue/Lambda/EMR via
> Resource Groups Tagging, Cost Explorer via a tag filter; incidents via the active provider — Jira
> `labels` JQL clause or ServiceNow's `SERVICENOW_PROJECT_FIELD`). Absent /
> `all` = no filter. See [02-backend-python.md → Project tag filtering](./02-backend-python.md#project-tag-filtering).

---

## Overview  (Executive Overview page)

| Method | Path | Backend | Response type |
|--------|------|---------|---------------|
| GET | `/overview/kpis` | FastAPI ✅ / Express ✅ | `OverviewKpis` |
| GET | `/overview/health-distribution` | FastAPI ✅ / Express ✅ | `HealthDistribution` |
| GET | `/overview/job-status-trend` | FastAPI ✅ / Express ✅ | `JobStatusTrendItem[]` |
| GET | `/overview/failed-jobs` | FastAPI ✅ / Express ✅ | `FailedJob[]` |
| GET | `/overview/active-incidents` | FastAPI ✅ / Express ✅ | `ActiveIncident[]` |

**`OverviewKpis`** — `totalPipelines, healthy, degraded, failed, failedJobs24h, activeP1, activeP2,
slaBreaches, avgMtta, avgMttr, topImpactedDomain, slaCompliancePercent`
**`HealthDistribution`** — `{ domains: DomainHealth[] }` where `DomainHealth = { name, healthy,
degraded, failed }`
**`JobStatusPoint`** — `timestamp, success, failed, running`
**`FailedJob`** — `id, pipelineName, domain, failedAt, duration, errorType, owner, severity`
**`ActiveIncident`** — `id, title, severity, status, pipeline, domain, createdAt, owner,
acknowledged, escalationLevel, age`

---

## Pipelines  (Live operations)

| Method | Path | Backend | Response type |
|--------|------|---------|---------------|
| GET | `/pipelines/live` | FastAPI ✅ / Express ✅ | `LiveStatus` |
| GET | `/pipelines/runs` | FastAPI ✅ / Express ✅ | `PipelineRun[]` |
| GET | `/pipelines/history/{pipeline_name}` | FastAPI ✅ / Express ✅ | `PipelineHistoryItem[]` |

**`LiveStatus`** — `running, failed, timedOut, delayed, waitingUpstream`
**`PipelineRun`** — `id, pipelineName, status, startTime, endTime, duration, owner, environment,
domain, costPerRun`
**`PipelineHistoryItem`** — `id, status, startTime, durationMin, cost, recordsProcessed,
errorMessage?`

---

## Lambdas

| Method | Path | Backend | Response type |
|--------|------|---------|---------------|
| GET | `/lambdas/kpis` | FastAPI ✅ / Express ✅ | `LambdaKpis` |
| GET | `/lambdas/runs` | FastAPI ✅ / Express ✅ | `LambdaInvocation[]` |
| GET | `/lambdas/history/{functionName}` | FastAPI ✅ / Express ⚪ | `PipelineHistoryItem[]` — recent invocations parsed from CloudWatch logs (id = RequestId) |
| GET | `/lambdas/cost-breakdown` | Express ⚪ | cost breakdown |
| GET | `/lambdas/cost-performance` | Express ⚪ | cost vs perf |

## EMR (on-EC2) & EMR Serverless

| Method | Path | Backend | Response type |
|--------|------|---------|---------------|
| GET | `/emr/runs` | FastAPI ✅ | `PipelineRun[]` — one row per **EMR cluster** (id = cluster id) |
| GET | `/emr/history/{cluster}` | FastAPI ✅ | `PipelineHistoryItem[]` — the cluster's **steps** (id = cluster id, for log lookups) |
| GET | `/emr-serverless/runs` | FastAPI ✅ | `PipelineRun[]` — one row per **application** (id = app id, status from latest job run) |
| GET | `/emr-serverless/history/{application}` | FastAPI ✅ | `PipelineHistoryItem[]` — the app's **job runs** (id = job run id) |

Reuse the `PipelineRun` / `PipelineHistoryItem` shapes. `cluster` / `application` accept the id or the
name. Needs EMR/EMR-Serverless read IAM (`elasticmapreduce:*`, `emr-serverless:*` — see
`aws-backend/iam-policy.json`). Cost is not exposed by these APIs, so `costPerRun`/`cost` are `0`.

---

## S3 logs  (custom log source, FastAPI only)

Logs stored at `s3://<S3_LOG_BUCKET>/<project>/<run-id>.log`. Listing is scoped by the selected
project (X-Project header); when project is `all`, every prefix is listed.

| Method | Path | Backend | Response type |
|--------|------|---------|---------------|
| GET | `/s3/runs` | FastAPI ✅ | `{ id, runId, project, lastModified, sizeBytes }[]` — one row per `.log` object (id = object key without `.log`) |
| GET | `/logs/s3/{identifier}` | FastAPI ✅ (`limit` 1–5000) | `{ key, logGroup, events[], eventCount, timestamp }` — one event per line |

`identifier` is the object key without the `.log` suffix (e.g. `poc/run-123`), so it already carries
the project. Needs `S3_LOG_BUCKET` set and `s3:GetObject`/`s3:ListBucket` IAM. Path traversal (`..`)
is rejected.

## Ticket mappings  (log → incident link, FastAPI + SQLAlchemy only)

Associates a log identifier with the incident ticket (Jira/ServiceNow) raised for it — recorded
automatically when `/agents/analyze` `type=jira` returns a ticket key.

| Method | Path | Backend | Response type |
|--------|------|---------|---------------|
| GET | `/ticket-mappings` | FastAPI ✅ | `{ mappings: { log_id: { incidentId, provider, url, resourceType, project, createdAt } } }` — latest mapping per log id; optional `?log_ids=a,b` filters |

Backed by the `log_ticket_mappings` table (`DATABASE_URL`, SQLite by default — see
[02-backend-python.md](./02-backend-python.md#ticket-mappings)).

**`LambdaKpis`** — `totalFunctions, healthy, withErrors, throttled, avgDurationMs,
coldStartsPercent, totalInvocations24h`
**`LambdaInvocation`** — `id, functionName, status, startTime, endTime, duration, costPerRun` —
`id` is the function name (so it matches the log id used by agents / ticket mappings).

---

## Performance & Throughput  (mock-only page)

| Method | Path | Backend | Response type |
|--------|------|---------|---------------|
| GET | `/performance/duration-trend` | Express ⚪ | `DurationTrendItem[]` |
| GET | `/performance/slowest-jobs` | Express ⚪ | `SlowJob[]` |
| GET | `/performance/throughput` | Express ⚪ | `ThroughputItem[]` |

---

## Incidents  (Incident Center)

| Method | Path | Backend | Response type |
|--------|------|---------|---------------|
| GET | `/incidents/summary` | FastAPI ✅ / Express ✅ | `IncidentSummary` |
| GET | `/incidents/list` | FastAPI ✅ | `IncidentRecord[]` |
| GET | `/incidents/mttr-trend` | FastAPI 🟡 / Express ✅ | `MttrTrendPoint[]` |
| GET | `/incidents/distribution` | FastAPI 🟡 | `IncidentDistributionItem[]` |
| GET | `/incidents/queue` | Express ⚪ | `IncidentQueueItem[]` |
| GET | `/incidents/oncall` | Express ⚪ | on-call roster |

**`IncidentSummary`** — `open, acknowledged, resolved24h, p1, p2, p3`
**`IncidentRecord`** — `id, title, severity, status, pipeline, domain, createdAt, owner, age`
**`MttrTrendPoint`** — `date, mtta, mttr, incidents`
**`IncidentDistributionItem`** — `severity, count`

> FastAPI `mttr-trend` and `distribution` return `[]` (not implemented). Jira has no direct
> acknowledgement field, so `IncidentSummary.acknowledged` is always `0` from FastAPI.

---

## RCA & Prevention

| Method | Path | Backend | Response type |
|--------|------|---------|---------------|
| GET | `/rca/lifecycle` | FastAPI ✅ / Express ✅ | `RcaLifecycle` |
| GET | `/rca/repeat-incidents` | FastAPI ✅ / Express ✅ | `RepeatIncident[]` |
| GET | `/rca/detail/{id}` | Express ⚪ | RCA detail |
| GET | `/rca/failure-patterns` | Express ⚪ | `FailurePattern[]` |
| GET | `/rca/metrics` | Express ⚪ | `RcaMetrics` |

**`RcaLifecycle`** — `{ stages: LifecycleStage[] }` where `LifecycleStage = { stage, avgMinutes }`
(stages: Detect, Acknowledge, Mitigate, Resolve, RCA Published — only Resolve is populated by
FastAPI)
**`RepeatIncident`** — `pipeline, occurrences, lastSeen, rootCause`

---

## Costs & Financial Insights

| Method | Path | Backend | Response type |
|--------|------|---------|---------------|
| GET | `/costs/kpis` | FastAPI ✅ / Express ✅ | `CostKpis` |
| GET | `/costs/breakdown` | FastAPI ✅ / Express ✅ | `CostBreakdown` |
| GET | `/costs/performance` | FastAPI ✅ / Express ✅ | `CostPerformance` |
| GET | `/costs/service-trend` | FastAPI ✅ / Express ✅ | `ServiceTrend` (not in OpenAPI spec) |
| GET | `/costs/optimization` | Express ⚪ | `OptimizationInsight[]` |

**`CostKpis`** — `totalCostMtd, avgCostPerRun, costOfFailedRuns, budget`
**`CostBreakdown`** — `{ byPipeline: { name, cost }[] }`
**`CostTrendPoint`** — `date, cost`
**`CostPerformance`** — `{ costVsPipeline: CostTrendPoint[], costRanges: { today, 7d, 30d } }`
**`ServiceTrend`** — `{ "7d", "30d", "60d", "90d" }` (aliases of `ranges_*`), each a
`ServiceTrendSeries = { glue: CostTrendPoint[], lambda: CostTrendPoint[], all: CostTrendPoint[] }`

---

## CloudWatch Logs  (FastAPI only)

| Method | Path | Query | Response |
|--------|------|-------|----------|
| GET | `/logs/job/{job_id}` | `limit` 1–1000 (100) | `{ jobId, logGroup, events[], eventCount, timestamp }` |
| GET | `/logs/lambda/{function_name}` | `limit` 1–1000 (100) | `{ functionName, logGroup, events[], eventCount, timestamp }` |
| GET | `/logs/emr/{cluster_id}` | `limit` 1–1000 (100) | `{ clusterId, logGroup, events[], eventCount, timestamp }` (EMR-on-EC2) |
| GET | `/logs/emr-serverless/{job_run_id}` | `limit` 1–1000 (100) | `{ jobRunId, logGroup, events[], eventCount, timestamp }` (EMR Serverless) |

EMR logs are read from CloudWatch (`emr_log_group` / `emr_serverless_log_group`); if the group isn't
configured/found the response carries a `message` and empty `events`.

Each `event` = `{ timestamp, message, stream }`. Errors return an `{ …, error, events: [] }` envelope.
(The Express mock also implements `/logs/job/:jobId` and `/logs/lambda/:functionName`.)

---

## AI Agents  (FastAPI only)

### Fully-agentic — `routers/agents.py`  (wired into `main.py`; used by every AI button in the UI)

**`POST /agents/analyze`**
Request `AgentRequest` — `log_id` (identifier interpreted per `resource_type`), `type: "log"|"jira"`,
`resource_type: "job"|"lambda"|"emr"|"emr_serverless"|"s3"` (default `"job"`). The `log_id` is a Glue
run id / Lambda function name / EMR cluster (or step) id / EMR Serverless job run id / S3 log
identifier (object key without `.log`) respectively.
Response `AgentResponse` — `log_id, type, analysis, jira_key?`.
- `type="log"` → fetch logs (per `resource_type`) → LLM analysis.
- `type="jira"` → fetch logs → LLM analysis → create a ticket in the configured provider
  (Jira/ServiceNow) → return analysis + ticket id in `jira_key`.

> The single-shot log-text routes (`routers/agent.py` → `services/agent.py`, `POST /agent/*`) were
> unmounted dead code and have been removed; every AI button uses `/agents/analyze`.

The `analysis` string follows the structured format (`**Summary:** … **Severity:** … **Root
Cause:** … **Remediation:** …`) that `LogAnalysisModal.parseSections()` renders. See also
[agents-api.md](./agents-api.md).

---

## Error envelopes (FastAPI)

| Status | Shape | Cause |
|--------|-------|-------|
| 500 | `{ error: "InternalServerError", message }` | Unhandled exception |
| 500 | `{ error: <AWS code>, message }` | boto3 `ClientError` (non-throttle) |
| 502 | `{ error: <code>, message }` | AWS throttling / request limit |
| 502 | `{ error: "AWSConnectivity", message }` | `BotoCoreError` |
| 500 | `{ detail: <msg> }` | Jira/agent route failures (FastAPI `HTTPException`) |
| 401 | `{ detail: "Not authenticated" \| "Invalid or expired token" }` | Missing/invalid Cognito token on a protected route (`WWW-Authenticate: Bearer`) |
