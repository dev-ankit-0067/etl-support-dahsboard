"""Custom S3 log source — listing + log fetch.

Routes (mounted under the API prefix):
  GET /s3/runs                 → log objects under s3://<bucket>/<project>/ as run records
  GET /logs/s3/{identifier}    → the lines of a single <identifier>.log object
"""
from fastapi import APIRouter, Query

from ..services import s3_logs_service

router = APIRouter(tags=["s3"])


@router.get("/s3/runs")
def list_runs():
    """List S3 log files for the active project (all prefixes when project is 'all')."""
    return s3_logs_service.list_runs()


@router.get("/logs/s3/{identifier:path}")
def get_s3_logs(identifier: str, limit: int = Query(1000, ge=1, le=5000)):
    """Fetch the contents of a single S3 log object.

    Args:
        identifier: object key without the `.log` suffix (e.g. `poc/run-123`).
        limit: max number of trailing lines to return.
    """
    return s3_logs_service.get_logs(identifier, limit=limit)
