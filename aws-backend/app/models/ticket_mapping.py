"""Log → incident ticket mapping (Jira/ServiceNow)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class TicketMapping(Base):
    """Associates a log identifier with the incident ticket raised for it."""

    __tablename__ = "log_ticket_mappings"
    __table_args__ = (
        UniqueConstraint("log_id", "incident_id", name="uq_log_ticket_mapping"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    log_id: Mapped[str] = mapped_column(
        String(512), index=True, nullable=False,
        comment="Log identifier (e.g. S3 object key without .log, or Glue run id).",
    )
    incident_id: Mapped[str] = mapped_column(
        String(128), nullable=False,
        comment="Ticket key/number in the provider (Jira key or ServiceNow number).",
    )
    provider: Mapped[str] = mapped_column(
        String(32), nullable=False, comment="Incident provider: 'jira' | 'servicenow'.",
    )
    ticket_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    resource_type: Mapped[Optional[str]] = mapped_column(
        String(32), nullable=True,
        comment="Resource kind the log belongs to: job | lambda | emr | emr_serverless | s3.",
    )
    project: Mapped[Optional[str]] = mapped_column(
        String(128), nullable=True, comment="Project tag value, when known.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
