"""LLM-generated incident analysis (root cause + key findings)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import DateTime, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class IncidentAnalysis(Base):
    """RCA (one-liner) and key findings (3–4 bullets) for a created incident."""

    __tablename__ = "incident_analyses"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    incident_id: Mapped[str] = mapped_column(
        String(128), unique=True, index=True, nullable=False,
        comment="Incident ticket key/number (Jira key or ServiceNow number).",
    )
    provider: Mapped[str] = mapped_column(
        String(32), nullable=False, comment="Incident provider: 'jira' | 'servicenow'.",
    )
    log_id: Mapped[Optional[str]] = mapped_column(
        String(512), nullable=True, comment="Log identifier the analysis was derived from.",
    )
    resource_type: Mapped[Optional[str]] = mapped_column(
        String(32), nullable=True,
        comment="Resource kind the log belongs to: job | lambda | emr | emr_serverless | s3.",
    )
    root_cause: Mapped[str] = mapped_column(
        Text, nullable=False, comment="One-line root cause summary (LLM-generated).",
    )
    key_findings: Mapped[List[str]] = mapped_column(
        JSON, nullable=False, default=list,
        comment="3–4 bullet-point key findings (LLM-generated).",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
