"""Agentic endpoints — log analysis and Jira ticket creation via LangChain."""
from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..services import agent_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentRequest(BaseModel):
    log_id: str = Field(..., description="Glue job run ID whose CloudWatch logs to analyse.")
    type: Literal["log", "jira"] = Field(
        ...,
        description=(
            "log — analyse logs and return the LLM analysis. "
            "jira — analyse logs AND create a Jira ticket; returns analysis + ticket key."
        ),
    )


class AgentResponse(BaseModel):
    log_id: str
    type: str
    analysis: str = Field(..., description="LLM-generated analysis of the CloudWatch logs.")
    jira_key: Optional[str] = Field(
        None, description="Created Jira ticket key (only present when type=jira)."
    )


@router.post("/analyze", response_model=AgentResponse)
def analyze(request: AgentRequest) -> AgentResponse:
    """
    Run an LLM agent against CloudWatch logs for a given Glue job run.

    - **type=log**: fetch logs → LLM analysis → return analysis.
    - **type=jira**: fetch logs → LLM analysis → create Jira ticket → return analysis + ticket key.
    """
    log.info("Agent request: type=%s log_id=%s", request.type, request.log_id)

    if request.type == "log":
        result = agent_service.run_log_analysis_agent(request.log_id)
    else:
        result = agent_service.run_jira_creation_agent(request.log_id)

    return AgentResponse(**result)
