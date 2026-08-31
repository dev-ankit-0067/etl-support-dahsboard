"""Service for recording and querying log → incident ticket mappings."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from ..config import get_settings
from ..database import SessionLocal
from ..models.ticket_mapping import TicketMapping

log = logging.getLogger(__name__)


def _ticket_url(provider: str, incident_id: str) -> Optional[str]:
    """Best-effort ticket URL from the configured provider."""
    settings = get_settings()
    pid = (provider or "").strip().lower()
    if pid == "jira" and settings.jira_url and incident_id:
        return f"{settings.jira_url.rstrip('/')}/browse/{incident_id}"
    if pid == "servicenow" and settings.servicenow_instance and incident_id:
        base = settings.servicenow_instance.rstrip("/")
        return f"{base}/incident_list.do?sysparm_query=number={incident_id}"
    return None


def record_ticket(
    log_id: str,
    incident_id: str,
    provider: str,
    ticket_url: Optional[str] = None,
    resource_type: Optional[str] = None,
    project: Optional[str] = None,
) -> Optional[TicketMapping]:
    """Persist a log→ticket mapping (idempotent per log_id + incident_id pair)."""
    if not log_id or not incident_id:
        return None
    db = SessionLocal()
    try:
        existing = (
            db.query(TicketMapping)
            .filter_by(log_id=log_id, incident_id=incident_id)
            .first()
        )
        if existing:
            return existing
        mapping = TicketMapping(
            log_id=log_id,
            incident_id=incident_id,
            provider=provider,
            ticket_url=ticket_url or _ticket_url(provider, incident_id),
            resource_type=resource_type,
            project=project,
        )
        db.add(mapping)
        db.commit()
        db.refresh(mapping)
        log.info("Recorded ticket mapping log=%s -> %s (%s)", log_id, incident_id, provider)
        return mapping
    except Exception as exc:  # noqa: BLE001 - mapping must never break ticket creation
        db.rollback()
        log.warning("Failed to record ticket mapping for log %s: %s", log_id, exc)
        return None
    finally:
        db.close()


def get_mappings(log_ids: Optional[List[str]] = None) -> Dict[str, Dict[str, Any]]:
    """Return the latest mapping per log id: ``{log_id: {incidentId, provider, url, ...}}``.

    When ``log_ids`` is None every mapping is returned (table is small); the
    executive overview uses this to show ticket links next to log rows.
    """
    db = SessionLocal()
    try:
        query = db.query(TicketMapping)
        if log_ids:
            query = query.filter(TicketMapping.log_id.in_(log_ids))
        rows = query.all()
    finally:
        db.close()

    latest: Dict[str, TicketMapping] = {}
    for m in rows:
        cur = latest.get(m.log_id)
        if cur is None or m.created_at > cur.created_at:
            latest[m.log_id] = m

    return {
        lid: {
            "incidentId": m.incident_id,
            "provider": m.provider,
            "url": m.ticket_url,
            "resourceType": m.resource_type,
            "project": m.project,
            "createdAt": m.created_at.isoformat() if m.created_at else None,
        }
        for lid, m in latest.items()
    }
