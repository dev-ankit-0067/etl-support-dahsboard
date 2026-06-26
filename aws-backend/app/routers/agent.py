"""AI agent routes for log analysis and Jira ticket creation."""
from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException

from ..config import get_settings
from ..models.agent import (
    JiraTicketRequest,
    JiraTicketResponse,
    LogAnalysisRequest,
    LogAnalysisResponse,
)
from ..services.agent import analyze_log_text, create_jira_issue

log = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/analysis", response_model=LogAnalysisResponse)
def analyze_logs(request: LogAnalysisRequest):
    """Analyze CloudWatch log text with a Hugging Face model."""
    try:
        rca_text = analyze_log_text(request.logText, request.resourceType, request.jobId, request.jobName)
        return LogAnalysisResponse(
            summary=rca_text,
            rca=rca_text,
            insights="Generated from CloudWatch logs using Hugging Face inference.",
            model=get_settings().huggingface_model_name,
        )
    except Exception as exc:
        log.error("Log analysis failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/jira", response_model=JiraTicketResponse)
def create_jira_ticket(request: JiraTicketRequest):
    """Create a new Jira issue from CloudWatch log context."""
    try:
        summary = request.summary or (
            f"CloudWatch {request.resourceType.title()} log issue - {request.jobName or request.jobId or 'unknown'}"
        )

        body = request.description
        if request.rca:
            body = f"{body}\n\nRCA:\n{request.rca.strip()}"

        issue = create_jira_issue(summary, body, issue_type=request.issueType)

        issue_url = None
        settings = get_settings()
        if settings.jira_url:
            issue_url = f"{settings.jira_url.rstrip('/')}/browse/{issue.key}"

        return JiraTicketResponse(issueKey=issue.key, issueUrl=issue_url, summary=summary)
    except Exception as exc:
        log.error("Jira ticket creation failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
