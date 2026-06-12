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
from ..services import jira_service

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
def create_jira_ticket(summary: str, description: str, priority: str = "Medium") -> str:
    """Create a Jira issue for an ETL pipeline incident. Returns the created ticket key.

    Args:
        summary: Short one-line title (include severity, e.g. '[P1] pipeline: issue').
        description: Full incident description with root cause and remediation steps.
        priority: Jira priority — one of Highest, High, Medium, Low.
    """
    return jira_service.create_ticket(
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

When given a Glue job run ID:
1. Call fetch_cloudwatch_logs to retrieve the logs.
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

_JIRA_CREATION_SYSTEM = """You are an expert AWS ETL pipeline operations engineer with access to CloudWatch and Jira.

When given a Glue job run ID:
1. Call fetch_cloudwatch_logs to retrieve the logs.
2. Analyse the logs: identify root cause, severity, and affected components.
3. Call create_jira_ticket with:
   - summary: "[<SEVERITY>] <pipeline_name>: <one-line issue>"
   - description: full markdown incident report (error details, timestamps, root cause, remediation)
   - priority: P1→Highest, P2→High, P3→Medium, P4→Low
4. Confirm the Jira ticket key and provide your full structured analysis."""


# ---------------------------------------------------------------------------
# Agent runners
# ---------------------------------------------------------------------------

def run_log_analysis_agent(log_id: str) -> Dict[str, Any]:
    """Fetch and analyse CloudWatch logs for a Glue job run using a LangChain agent."""
    llm = _get_chat_model()
    agent = create_agent(
        model=llm,
        tools=[fetch_cloudwatch_logs],
        system_prompt=_LOG_ANALYSIS_SYSTEM,
    )

    result = agent.invoke({"messages": [("human", f"Analyse logs for job ID: {log_id}")]})
    output = result["messages"][-1].content

    return {
        "log_id": log_id,
        "type": "log",
        "analysis": output,
        "jira_key": None,
    }


def run_jira_creation_agent(log_id: str) -> Dict[str, Any]:
    """Fetch logs, analyse them, and create a Jira ticket via a LangChain agent."""
    llm = _get_chat_model()
    agent = create_agent(
        model=llm,
        tools=[fetch_cloudwatch_logs, create_jira_ticket],
        system_prompt=_JIRA_CREATION_SYSTEM,
    )

    result = agent.invoke({
        "messages": [("human", f"Analyse logs and create a Jira ticket for job ID: {log_id}")]
    })
    output = result["messages"][-1].content

    # Extract Jira key from the ToolMessage emitted by create_jira_ticket
    jira_key: Optional[str] = None
    for msg in result["messages"]:
        if isinstance(msg, ToolMessage) and getattr(msg, "name", None) == "create_jira_ticket":
            jira_key = str(msg.content)
            break

    return {
        "log_id": log_id,
        "type": "jira",
        "analysis": output,
        "jira_key": jira_key,
    }
