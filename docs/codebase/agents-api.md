# Agents API — Log Analysis & Jira Ticket Creation

**Endpoint:** `POST /api/agents/analyze`  
**Tags:** `agents`  
**Added:** May 2026

---

## Overview

This endpoint runs a LangChain agent powered by a HuggingFace open-source LLM. Given a Glue job run ID, the agent fetches its CloudWatch logs and produces a structured incident analysis. Optionally, it also creates a Jira ticket capturing the incident details.

Two modes are supported via the `type` field:

| `type` | What happens |
|--------|-------------|
| `log`  | Fetch logs → LLM analysis → return analysis |
| `jira` | Fetch logs → LLM analysis → create Jira ticket → return analysis + ticket key |

---

## Configuration

Add the following to `aws-backend/.env` (see `.env.example`):

```env
# Required
HUGGINGFACE_API_TOKEN=hf_your_token_here

# Optional — defaults to Qwen/Qwen2.5-72B-Instruct
# Must be a model that supports tool/function calling
HUGGINGFACE_MODEL=Qwen/Qwen2.5-72B-Instruct
```

The incident provider must also be configured for `type=jira` (ticket creation) to work. The
provider is chosen by `INCIDENT_PROVIDER` (default `jira`):

```env
INCIDENT_PROVIDER=jira          # jira | servicenow

# when INCIDENT_PROVIDER=jira
JIRA_URL=https://your-org.atlassian.net
JIRA_USERNAME=your@email.com
JIRA_API_TOKEN=your_jira_api_token
JIRA_PROJECT_KEY=SCRUM          # project where tickets are created
JIRA_ISSUE_TYPE=Bug             # issue type for created tickets

# when INCIDENT_PROVIDER=servicenow
# SERVICENOW_INSTANCE=https://devXXXXX.service-now.com
# SERVICENOW_USER=admin
# SERVICENOW_PASSWORD=your_password_or_token
```

---

## Request

**`POST /api/agents/analyze`**

### Headers

| Header         | Value              |
|----------------|--------------------|
| `Content-Type` | `application/json` |

### Body

```json
{
  "log_id": "jr_abc1234567890",
  "type": "log"
}
```

| Field    | Type                    | Required | Description |
|----------|-------------------------|----------|-------------|
| `log_id` | `string`                | Yes      | AWS Glue job run ID. Used to look up the CloudWatch log stream at `/aws-glue/jobs/output`. |
| `type`   | `"log"` \| `"jira"`     | Yes      | `log` — analysis only. `jira` — analysis + create Jira ticket. |

---

## Response

### `type=log`

```json
{
  "log_id": "jr_abc1234567890",
  "type": "log",
  "analysis": "**Summary:** ConnectionTimeout in fin_gl_ledger_sync at DB connection pool step\n**Severity:** P1\n**Root Cause:** ...\n**Affected Component:** ...\n**Remediation:** ...\n**Details:** ...",
  "jira_key": null
}
```

### `type=jira`

```json
{
  "log_id": "jr_abc1234567890",
  "type": "jira",
  "analysis": "**Summary:** ConnectionTimeout in fin_gl_ledger_sync...\n...",
  "jira_key": "SCRUM-108"
}
```

### Response fields

| Field      | Type              | Description |
|------------|-------------------|-------------|
| `log_id`   | `string`          | Echo of the input job run ID. |
| `type`     | `string`          | Echo of the input type. |
| `analysis` | `string`          | Structured LLM analysis (markdown formatted). Always present. |
| `jira_key` | `string` \| `null`| Created Jira ticket key. Present only when `type=jira` and ticket creation succeeded. |

### Analysis format

The `analysis` field is markdown-formatted and contains the following sections:

```
**Summary:**          One-line description of the issue
**Severity:**         P1 / P2 / P3 / P4
**Root Cause:**       What caused the failure
**Affected Component:** Which pipeline stage / transform / connection failed
**Remediation:**      Numbered list of recommended fix steps
**Details:**          Full analysis with relevant log excerpts
```

Severity mapping:

| Severity | Meaning |
|----------|---------|
| P1 | Data loss or pipeline completely down |
| P2 | Significant degradation, partial failure |
| P3 | Non-critical warning, recoverable error |
| P4 | Informational, no immediate action needed |

---

## Error responses

| HTTP status | `error` field         | Cause |
|-------------|-----------------------|-------|
| `500`       | `InternalServerError` | Agent or LLM failure |
| `502`       | `AWSClientError`      | CloudWatch API error (invalid job ID, missing permissions) |
| `502`       | `AWSConnectivity`     | Cannot reach AWS |
| `422`       | _(FastAPI validation)_ | Missing or invalid request body fields |

---

## Example — cURL

### Analyse logs only

```bash
curl -X POST http://localhost:8000/api/agents/analyze \
  -H "Content-Type: application/json" \
  -d '{"log_id": "jr_abc1234567890", "type": "log"}'
```

### Analyse logs and create Jira ticket

```bash
curl -X POST http://localhost:8000/api/agents/analyze \
  -H "Content-Type: application/json" \
  -d '{"log_id": "jr_abc1234567890", "type": "jira"}'
```

---

## Architecture

```
POST /api/agents/analyze
        │
        ▼
  agents.router (FastAPI)
        │
        ▼
  agent_service.py
        │
        ├─ type=log  ──► run_log_analysis_agent()
        │                      │
        │                      ├─ Tool: fetch_cloudwatch_logs
        │                      │         └─ cloudwatch_service.get_job_logs()
        │                      │                └─ AWS CloudWatch Logs API
        │                      └─ LLM: HuggingFace Inference API
        │
        └─ type=jira ──► run_jira_creation_agent()
                               │
                               ├─ Tool: fetch_cloudwatch_logs (same as above)
                               ├─ Tool: create_incident_ticket
                               │         └─ incidents_service.create_ticket()
                               │                └─ MCP server (Jira SDK or ServiceNow REST)
                               │                   selected by INCIDENT_PROVIDER
                               └─ LLM: HuggingFace Inference API
```

> The request field `type:"jira"` and response field `jira_key` are **kept as-is for API
> stability** — they are mode/field names, not provider names. The ticket is created in whichever
> backend `INCIDENT_PROVIDER` selects (Jira or ServiceNow); see
> [02-backend-python.md](./02-backend-python.md#incidents--rca--mcp-based-provider-jira-or-servicenow).

### Key source files

| File | Role |
|------|------|
| `app/routers/agents.py` | FastAPI route definition, request/response models |
| `app/services/agent_service.py` | LangChain agents, tool definitions (`create_incident_ticket`), LLM factory |
| `app/services/cloudwatch_service.py` | CloudWatch log fetching (`get_job_logs`) |
| `app/services/incidents_service.py` | Provider-agnostic ticket creation (`create_ticket`) via MCP |
| `app/mcp_servers/{jira,servicenow}_server.py` | MCP servers doing the actual Jira/ServiceNow calls |
| `app/config.py` | `incident_provider`, `huggingface_api_token`, `huggingface_model` settings |

---

## Supported models

The default model is `Qwen/Qwen2.5-72B-Instruct` (the `huggingface_model` setting). Any HuggingFace
model that supports **tool/function calling** and is served as a **chat model** on the Inference API
can be used via the `HUGGINGFACE_MODEL` env var.

Tested compatible models:

| Model | Notes |
|-------|-------|
| `Qwen/Qwen2.5-72B-Instruct` | Default. Strong tool-calling support. Slow inference — needs raised timeouts (see below). |
| `meta-llama/Meta-Llama-3-8B-Instruct` | Higher quality per token, faster; gated (accept license on HF). |
| `meta-llama/Meta-Llama-3-70B-Instruct` | Best quality, requires HF Pro tier. |

> **`mistralai/Mistral-7B-Instruct-v0.3` does NOT work** — the Inference API rejects it with
> `model_not_supported` / "not a chat model", so `POST /api/agents/analyze` fails.

> **Timeouts:** the agent path can take a while (72B inference + multi-step tool loop). Keep the
> gunicorn worker timeout and the ALB idle timeout above the request duration — deploy with
> `GUNICORN_TIMEOUT=300` and raise the ALB `idle_timeout.timeout_seconds` to 300 (default is 60s,
> which produces `504 Gateway Timeout`).
