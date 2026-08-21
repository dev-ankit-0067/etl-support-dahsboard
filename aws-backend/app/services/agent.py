"""LangChain-backed log analysis and Jira ticket creation."""
from __future__ import annotations

import logging
import re
from typing import Optional

from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint

from ..config import get_settings
from ..prompts import ANALYSIS_PROMPT, KEY_FINDINGS_PROMPT
from .jira_service import JiraClient

log = logging.getLogger(__name__)


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


def _run_huggingface_inference(prompt_template, prompt_inputs: dict[str, str]) -> str:
    chat_model = _build_chat_model()
    prompt_value = prompt_template.format_prompt(**prompt_inputs)

    try:
        response = chat_model.invoke(prompt_value)
    except Exception as exc:
        log.error("Hugging Face inference failed: %s", exc)
        raise RuntimeError(f"Hugging Face API request failed: {exc}") from exc

    return getattr(response, "content", str(response)).strip()


def _build_key_finding_inputs(title: Optional[str], description: Optional[str], notes: Optional[list[str]]) -> dict[str, str]:
    title_text = title or "Untitled incident"
    description_text = description or "No detailed description provided."
    notes_text = "\n".join(notes) if notes else "No additional notes provided."
    return {"title": title_text, "description": description_text, "notes": notes_text}


def sanitize_key_findings_payload(result: dict | None) -> dict:
    """Remove heading-only entries from the API payload before returning it."""
    if not result:
        return {"key_findings": []}

    items = result.get("key_findings") or []
    if not isinstance(items, list):
        items = [items] if items is not None else []

    cleaned_items: list[str] = []
    for item in items:
        if not isinstance(item, str):
            continue
        cleaned = item.strip()
        if not cleaned:
            continue
        if re.match(r'^(key findings|key finding|findings|summary)\s*:?$', cleaned.lower()):
            continue
        cleaned_items.append(cleaned)

    return {"key_findings": cleaned_items}


def _normalize_key_findings_response(text: str) -> list[str]:
    PREFIXES_PATTERN = r'^[\s\-\*\u2022\u00B7\u2023\u2024\u2027]+'
    HEADERS_PATTERN = r'^(summary|key findings|key finding|findings)\s*:?$'

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    findings: list[str] = []

    for raw in lines:
        cleaned = re.sub(PREFIXES_PATTERN, '', raw)
        cleaned = re.sub(r'^\d+[\)\.]\s*', '', cleaned)
        cleaned = re.sub(r'\*\*(.*?)\*\*', r'\1', cleaned)
        cleaned = re.sub(r'\*(.*?)\*', r'\1', cleaned)
        cleaned = cleaned.replace('`', '').strip()

        if cleaned and not re.match(HEADERS_PATTERN, cleaned.lower()):
            findings.append(cleaned)

    return findings[:6]


def analyze_log_text(log_text: str, resource_type: str, job_id: Optional[str] = None, job_name: Optional[str] = None) -> str:
    if not log_text.strip():
        raise ValueError("No log content provided for analysis.")

    prompt_inputs = _build_analysis_inputs(log_text, resource_type, job_id, job_name)
    return _run_huggingface_inference(ANALYSIS_PROMPT, prompt_inputs)


def analyze_key_findings(title: Optional[str], description: Optional[str], notes: Optional[list[str]] = None) -> dict:
    has_content = any(part and part.strip() for part in [title, description]) or notes
    if not has_content:
        raise ValueError("No incident details provided for key findings analysis.")

    prompt_inputs = _build_key_finding_inputs(title, description, notes)
    response = _run_huggingface_inference(KEY_FINDINGS_PROMPT, prompt_inputs)
    findings = _normalize_key_findings_response(response)
    return sanitize_key_findings_payload({"key_findings": findings})


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
