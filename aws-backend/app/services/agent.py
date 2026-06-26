"""LangChain-backed log analysis and Jira ticket creation."""
from __future__ import annotations

import logging
from typing import Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint

from ..config import get_settings
from .jira_service import JiraClient

log = logging.getLogger(__name__)

ANALYSIS_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are an AI assistant that analyzes CloudWatch log output. "
        "Identify the most likely root cause, highlight any error patterns, and suggest the next debugging steps. "
        "Keep the response concise and actionable."
    ),
    (
        "human",
        "Resource type: {resource_label}\n"
        "Resource name: {resource_name}\n\n"
        "Log output:\n"
        "{log_text}\n\n"
        "Response format: Provide a short summary and then a few bullet-style next steps."
    ),
])


def _build_analysis_inputs(log_text: str, resource_type: str, job_id: Optional[str], job_name: Optional[str]) -> dict[str, str]:
    resource_label = "Lambda function" if resource_type == "lambda" else "Glue job"
    resource_name = job_name or job_id or "Unknown"

    return {
        "resource_label": resource_label,
        "resource_name": resource_name,
        "log_text": log_text,
    }


def _build_chat_model() -> ChatHuggingFace:
    settings = get_settings()

    if not settings.huggingface_api_token:
        raise ValueError(
            "Hugging Face API token not configured. Set huggingface_api_token in environment."
        )

    hf_endpoint = HuggingFaceEndpoint(
        repo_id=settings.huggingface_model_name,
        task="conversational",
        huggingfacehub_api_token=settings.huggingface_api_token,
        max_new_tokens=512,
        temperature=0.2,
        provider="auto",
    )

    return ChatHuggingFace(llm=hf_endpoint)


def _run_huggingface_inference(prompt_inputs: dict[str, str]) -> str:
    chat_model = _build_chat_model()
    prompt_value = ANALYSIS_PROMPT.format_prompt(**prompt_inputs)

    try:
        response = chat_model.invoke(prompt_value)
    except Exception as exc:
        log.error("Hugging Face inference failed: %s", exc)
        raise RuntimeError(f"Hugging Face API request failed: {exc}") from exc

    return getattr(response, "content", str(response)).strip()


def analyze_log_text(log_text: str, resource_type: str, job_id: Optional[str] = None, job_name: Optional[str] = None) -> str:
    if not log_text.strip():
        raise ValueError("No log content provided for analysis.")

    prompt_inputs = _build_analysis_inputs(log_text, resource_type, job_id, job_name)
    return _run_huggingface_inference(prompt_inputs)


def create_jira_issue(summary: str, description: str, issue_type: Optional[str] = None):
    settings = get_settings()
    client = JiraClient.get_client()
    issue_type = issue_type or settings.jira_issue_type

    fields = {
        "project": {"key": settings.jira_project_key},
        "summary": summary,
        "description": description,
        "issuetype": {"name": issue_type},
    }

    issue = client.create_issue(fields=fields)
    return issue
