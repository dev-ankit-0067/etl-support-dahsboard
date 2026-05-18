"""LangChain agents for CloudWatch log analysis and Jira ticket creation."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
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
    lines = [f"[{e['timestamp']}] {e['message']}" for e in events]
    return "\n".join(lines)


@tool
def create_jira_ticket(summary: str, description: str, priority: str = "Medium") -> str:
    """Create a Jira issue for an ETL pipeline incident. Returns the created ticket key.

    Args:
        summary: Short one-line title for the ticket (include severity, e.g. '[P1] ...').
        description: Full incident description including root cause and remediation steps.
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
        task="text-generation",
        max_new_tokens=4096,
        temperature=0.1,
    )
    return ChatHuggingFace(llm=endpoint)


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

_LOG_ANALYSIS_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """You are an expert AWS ETL pipeline operations engineer.

When given a Glue job run ID:
1. Call fetch_cloudwatch_logs to retrieve the logs.
2. Identify all errors, exceptions, warnings, and anomalies.
3. Determine the root cause.
4. Rate severity: P1 (data loss / pipeline fully down), P2 (significant degradation),
   P3 (non-critical warning), P4 (informational).
5. Suggest concrete remediation steps.

Respond with a structured analysis in this format:
**Summary:** <one-line description>
**Severity:** <P1/P2/P3/P4>
**Root Cause:** <what caused the failure>
**Affected Component:** <which stage/transform/connection failed>
**Remediation:** <numbered list of fix steps>
**Details:** <full analysis with relevant log excerpts>""",
    ),
    ("human", "{input}"),
    MessagesPlaceholder("agent_scratchpad"),
])

_JIRA_CREATION_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """You are an expert AWS ETL pipeline operations engineer with access to CloudWatch and Jira.

When given a Glue job run ID:
1. Call fetch_cloudwatch_logs to retrieve the logs.
2. Analyse the logs to identify root cause, severity, and affected components.
3. Call create_jira_ticket with:
   - summary: "[<SEVERITY>] <pipeline_name>: <one-line issue>" (e.g. "[P1] fin_gl_ledger_sync: ConnectionTimeout")
   - description: full markdown-formatted incident report including:
       * Error details and log excerpts
       * Timestamps
       * Root cause analysis
       * Affected pipeline / component
       * Recommended remediation steps
   - priority: map P1→Highest, P2→High, P3→Medium, P4→Low
4. After creating the ticket, report back with your full analysis AND the Jira ticket key.""",
    ),
    ("human", "{input}"),
    MessagesPlaceholder("agent_scratchpad"),
])


# ---------------------------------------------------------------------------
# Agent runners
# ---------------------------------------------------------------------------

def run_log_analysis_agent(log_id: str) -> Dict[str, Any]:
    """Fetch and analyse CloudWatch logs for a Glue job run using an LLM agent."""
    llm = _get_chat_model()
    tools = [fetch_cloudwatch_logs]

    agent = create_tool_calling_agent(llm, tools, _LOG_ANALYSIS_PROMPT)
    executor = AgentExecutor(agent=agent, tools=tools, verbose=True, max_iterations=5)

    result = executor.invoke({"input": f"Analyse logs for job ID: {log_id}"})
    return {
        "log_id": log_id,
        "type": "log",
        "analysis": result.get("output", ""),
        "jira_key": None,
    }


def run_jira_creation_agent(log_id: str) -> Dict[str, Any]:
    """Fetch logs, analyse them, and create a Jira ticket via an LLM agent."""
    llm = _get_chat_model()
    tools = [fetch_cloudwatch_logs, create_jira_ticket]

    agent = create_tool_calling_agent(llm, tools, _JIRA_CREATION_PROMPT)
    executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        max_iterations=8,
        return_intermediate_steps=True,
    )

    result = executor.invoke({"input": f"Analyse logs and create a Jira ticket for job ID: {log_id}"})

    # Extract the Jira key from the tool call observation
    jira_key: Optional[str] = None
    for action, observation in result.get("intermediate_steps", []):
        if getattr(action, "tool", None) == "create_jira_ticket":
            jira_key = str(observation)
            break

    return {
        "log_id": log_id,
        "type": "jira",
        "analysis": result.get("output", ""),
        "jira_key": jira_key,
    }
