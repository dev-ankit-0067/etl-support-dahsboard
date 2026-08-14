"""LangChain agents for CloudWatch log analysis and Jira ticket creation."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from langchain.agents import create_agent
from langchain_core.messages import ToolMessage
from langchain_core.tools import tool
from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint

from ..config import get_settings
from ..services import cloudwatch_service
from ..services import incidents_service
from ..services import s3_logs_service

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@tool
def fetch_cloudwatch_logs(job_id: str) -> str:
    """Fetch CloudWatch logs for a Glue job run ID and return them as plain text."""
    data = cloudwatch_service.get_job_logs(job_id)
    events = data.get("events", [])
    if not events:
        return (
            f"No log events found for job '{job_id}'. "
            f"Message: {data.get('message', 'Unknown error')}"
        )
    return "\n".join(f"[{e['timestamp']}] {e['message']}" for e in events)


@tool
def fetch_lambda_logs(function_name: str) -> str:
    """Fetch CloudWatch logs for an AWS Lambda function by name and return them as plain text."""
    data = cloudwatch_service.get_lambda_logs(function_name)
    events = data.get("events", [])
    if not events:
        return (
            f"No log events found for Lambda function '{function_name}'. "
            f"Message: {data.get('message', 'Unknown error')}"
        )
    return "\n".join(f"[{e['timestamp']}] {e['message']}" for e in events)


@tool
def fetch_emr_logs(cluster_id: str) -> str:
    """Fetch CloudWatch logs for an EMR-on-EC2 cluster (or step id) and return them as plain text."""
    data = cloudwatch_service.get_emr_logs(cluster_id)
    events = data.get("events", [])
    if not events:
        return (
            f"No log events found for EMR cluster '{cluster_id}'. "
            f"Message: {data.get('message', 'Unknown error')}"
        )
    return "\n".join(f"[{e['timestamp']}] {e['message']}" for e in events)


@tool
def fetch_emr_serverless_logs(job_run_id: str) -> str:
    """Fetch CloudWatch logs for an EMR Serverless job run and return them as plain text."""
    data = cloudwatch_service.get_emr_serverless_logs(job_run_id)
    events = data.get("events", [])
    if not events:
        return (
            f"No log events found for EMR Serverless job run '{job_run_id}'. "
            f"Message: {data.get('message', 'Unknown error')}"
        )
    return "\n".join(f"[{e['timestamp']}] {e['message']}" for e in events)


@tool
def fetch_s3_logs(run_id: str) -> str:
    """Fetch a custom log stored in S3 by its identifier and return it as plain text.

    The identifier is the object key without the .log suffix (e.g. 'poc/run-123'),
    read from s3://<S3_LOG_BUCKET>/<identifier>.log.
    """
    return s3_logs_service.get_logs_text(run_id)


@tool
def create_incident_ticket(summary: str, description: str, priority: str = "Medium") -> str:
    """Create an incident ticket for an ETL pipeline issue. Returns the created ticket id/key.

    Routed to the configured provider (Jira or ServiceNow) via INCIDENT_PROVIDER.

    Args:
        summary: Short one-line title (include severity, e.g. '[P1] pipeline: issue').
        description: Full incident description with root cause and remediation steps.
        priority: Priority — one of Highest, High, Medium, Low (mapped per provider).
    """
    return incidents_service.create_ticket(
        summary=summary,
        description=description,
        priority=priority,
    )


# ---------------------------------------------------------------------------
# LLM factory
# ---------------------------------------------------------------------------

def _get_chat_model() -> ChatHuggingFace:
    settings = get_settings()
    endpoint = HuggingFaceEndpoint(
        repo_id=settings.huggingface_model,
        huggingfacehub_api_token=settings.huggingface_api_token,
        task="conversational",          # required for chat completions endpoint
        max_new_tokens=4096,
        temperature=0.1,
    )
    return ChatHuggingFace(llm=endpoint)


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

_LOG_ANALYSIS_SYSTEM = """You are an expert AWS ETL pipeline operations engineer.

When given a resource identifier (a Glue job run ID, a Lambda function name, an EMR cluster ID, an EMR Serverless job run ID, or an S3 log identifier):
1. Call the available log-retrieval tool to fetch the logs for that resource.
2. Identify all errors, exceptions, warnings, and anomalies.
3. Determine the root cause.
4. Rate severity: P1 (data loss / pipeline fully down), P2 (significant degradation),
   P3 (non-critical warning), P4 (informational).
5. Suggest concrete remediation steps.

Respond with a structured analysis in this exact format:
**Summary:** <one-line description>
**Severity:** <P1/P2/P3/P4>
**Root Cause:** <what caused the failure>
**Affected Component:** <which stage/transform/connection failed>
**Remediation:** <numbered list of fix steps>
**Details:** <full analysis with relevant log excerpts>"""

_JIRA_CREATION_SYSTEM = """You are an expert AWS ETL pipeline operations engineer with access to CloudWatch and an incident ticketing system.

When given a resource identifier (a Glue job run ID, a Lambda function name, an EMR cluster ID, an EMR Serverless job run ID, or an S3 log identifier):
1. Call the available log-retrieval tool to fetch the logs for that resource.
2. Analyse the logs: identify root cause, severity, and affected components.
3. Call create_incident_ticket with:
   - summary: "[<SEVERITY>] <pipeline_name>: <one-line issue>"
   - description: full markdown incident report (error details, timestamps, root cause, remediation)
   - priority: P1→Highest, P2→High, P3→Medium, P4→Low
4. Confirm the returned ticket id/key and provide your full structured analysis."""


# ---------------------------------------------------------------------------
# Agent runners
# ---------------------------------------------------------------------------

_LOG_TOOLS = {
    "lambda": fetch_lambda_logs,
    "emr": fetch_emr_logs,
    "emr_serverless": fetch_emr_serverless_logs,
    "s3": fetch_s3_logs,
    "job": fetch_cloudwatch_logs,
}

_RESOURCE_LABELS = {
    "lambda": "Lambda function name",
    "emr": "EMR cluster ID",
    "emr_serverless": "EMR Serverless job run ID",
    "s3": "S3 log identifier",
    "job": "Glue job run ID",
}


def _log_tool(resource_type: str):
    """Return the log-retrieval tool appropriate to the resource type."""
    return _LOG_TOOLS.get(resource_type, fetch_cloudwatch_logs)


def _resource_label(resource_type: str) -> str:
    return _RESOURCE_LABELS.get(resource_type, "Glue job run ID")


def run_log_analysis_agent(log_id: str, resource_type: str = "job") -> Dict[str, Any]:
    """Fetch and analyse CloudWatch logs for a Glue job run or Lambda function using a LangChain agent."""
    llm = _get_chat_model()
    agent = create_agent(
        model=llm,
        tools=[_log_tool(resource_type)],
        system_prompt=_LOG_ANALYSIS_SYSTEM,
    )

    result = agent.invoke({
        "messages": [("human", f"Analyse logs for {_resource_label(resource_type)}: {log_id}")]
    })
    output = result["messages"][-1].content

    return {
        "log_id": log_id,
        "type": "log",
        "analysis": output,
        "jira_key": None,
    }


def run_jira_creation_agent(log_id: str, resource_type: str = "job") -> Dict[str, Any]:
    """Fetch logs, analyse them, and create a Jira ticket via a LangChain agent."""
    llm = _get_chat_model()
    agent = create_agent(
        model=llm,
        tools=[_log_tool(resource_type), create_incident_ticket],
        system_prompt=_JIRA_CREATION_SYSTEM,
    )

    result = agent.invoke({
        "messages": [("human", f"Analyse logs and create a Jira ticket for {_resource_label(resource_type)}: {log_id}")]
    })
    output = result["messages"][-1].content

    # Extract the created ticket id/key from the ToolMessage emitted by create_incident_ticket
    jira_key: Optional[str] = None
    for msg in result["messages"]:
        if isinstance(msg, ToolMessage) and getattr(msg, "name", None) == "create_incident_ticket":
            jira_key = str(msg.content)
            break

    return {
        "log_id": log_id,
        "type": "jira",
        "analysis": output,
        "jira_key": jira_key,
    }
