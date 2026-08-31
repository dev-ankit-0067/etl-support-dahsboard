"""Service for recording/querying LLM-generated incident analyses (RCA + findings)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from ..database import SessionLocal
from ..models.incident_analysis import IncidentAnalysis

log = logging.getLogger(__name__)


def record_analysis(
    incident_id: str,
    provider: str,
    root_cause: str,
    key_findings: List[str],
    log_id: Optional[str] = None,
    resource_type: Optional[str] = None,
) -> Optional[IncidentAnalysis]:
    """Persist (or update) the analysis for an incident id (unique per incident)."""
    if not incident_id or not root_cause:
        return None
    db = SessionLocal()
    try:
        existing = db.query(IncidentAnalysis).filter_by(incident_id=incident_id).first()
        if existing:
            existing.root_cause = root_cause
            existing.key_findings = key_findings[:4]
            existing.log_id = log_id or existing.log_id
            existing.resource_type = resource_type or existing.resource_type
            db.commit()
            db.refresh(existing)
            return existing
        analysis = IncidentAnalysis(
            incident_id=incident_id,
            provider=provider,
            log_id=log_id,
            resource_type=resource_type,
            root_cause=root_cause,
            key_findings=key_findings[:4],
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)
        log.info("Recorded analysis for incident %s (%s)", incident_id, provider)
        return analysis
    except Exception as exc:  # noqa: BLE001 - must never break ticket creation
        db.rollback()
        log.warning("Failed to record incident analysis for %s: %s", incident_id, exc)
        return None
    finally:
        db.close()


def get_analyses(incident_ids: Optional[List[str]] = None) -> Dict[str, Dict[str, Any]]:
    """Return analyses keyed by incident id: ``{incident_id: {rootCause, keyFindings, ...}}``.

    When ``incident_ids`` is None every analysis is returned (table is small).
    """
    db = SessionLocal()
    try:
        query = db.query(IncidentAnalysis)
        if incident_ids:
            query = query.filter(IncidentAnalysis.incident_id.in_(incident_ids))
        rows = query.all()
    finally:
        db.close()

    return {
        a.incident_id: {
            "rootCause": a.root_cause,
            "keyFindings": a.key_findings or [],
            "provider": a.provider,
            "logId": a.log_id,
            "resourceType": a.resource_type,
            "createdAt": a.created_at.isoformat() if a.created_at else None,
        }
        for a in rows
    }
