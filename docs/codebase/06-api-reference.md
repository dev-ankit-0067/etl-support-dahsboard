# 06 · API reference

All endpoints are served under **`/api`** (except health, which is at the root on the FastAPI
backend). Fields are **camelCase**. "Backend" indicates which implementation serves the route today:
**FastAPI** = `aws-backend` (started by `startup.sh`, real data), **Express** = `artifacts/api-server`
(mock data). Some contract endpoints exist only on the Express mock.

Legend: ✅ implemented · 🟡 stub returns `[]` · ⚪ mock-only (not in FastAPI)

---

## Health

| Method | Path | Backend | Response |
|--------|------|---------|----------|
| GET | `/healthz` | FastAPI ✅ | `{ status: "ok", version }` |
| GET | `/healthz` | Express ✅ | `{ status: "ok" }` (validated via `HealthCheckResponse.parse`; no `version`) |
| GET | `/readyz` | FastAPI ✅ | `{ status: "ready" }` |

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
| GET | `/lambdas/history/{functionName}` | Express ⚪ | history items |
| GET | `/lambdas/cost-breakdown` | Express ⚪ | cost breakdown |
| GET | `/lambdas/cost-performance` | Express ⚪ | cost vs perf |

**`LambdaKpis`** — `totalFunctions, healthy, withErrors, throttled, avgDurationMs,
coldStartsPercent, totalInvocations24h`
**`LambdaInvocation`** — `id, functionName, status, startTime, endTime, duration, costPerRun`

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

Each `event` = `{ timestamp, message, stream }`. Errors return an `{ …, error, events: [] }` envelope.
(The Express mock also implements `/logs/job/:jobId` and `/logs/lambda/:functionName`.)

---

## AI Agents  (FastAPI only)

### Log-text-in variant — `routers/agent.py`  (present but not mounted in `main.py`; unused by the UI)

**`POST /agent/analysis`**
Request `LogAnalysisRequest` — `logText` (required), `jobId?`, `jobName?`,
`resourceType: "job"|"lambda"`.
Response `LogAnalysisResponse` — `summary, rca?, insights?, model?`.

**`POST /agent/jira`**
Request `JiraTicketRequest` — `summary?`, `description` (required), `rca?`, `jobId?`, `jobName?`,
`resourceType`, `issueType?`.
Response `JiraTicketResponse` — `issueKey, issueUrl?, summary?`.

### Fully-agentic variant — `routers/agents.py`  (wired into `main.py`; used by every AI button in the UI)

**`POST /agents/analyze`**
Request `AgentRequest` — `log_id` (Glue job run ID, or Lambda function name when
`resource_type="lambda"`), `type: "log"|"jira"`, `resource_type: "job"|"lambda"` (default `"job"`).
Response `AgentResponse` — `log_id, type, analysis, jira_key?`.
- `type="log"` → fetch logs (Glue **or** Lambda per `resource_type`) → LLM analysis.
- `type="jira"` → fetch logs → LLM analysis → create Jira ticket → return analysis + key.

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
