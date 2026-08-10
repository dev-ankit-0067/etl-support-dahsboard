"""AWS CloudWatch Logs service for fetching job/lambda output logs."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from botocore.exceptions import BotoCoreError, ClientError

from ..aws import client
from ..cache import cached
from ..config import get_settings

log = logging.getLogger(__name__)


def _get_log_group_for_job(job_id: str) -> str:
    """Generate CloudWatch log group name for a Glue job."""
    settings = get_settings()
    # Standard AWS Glue log group pattern
    return f"/aws-glue/jobs/output"


def _get_log_group_for_lambda(function_name: str) -> str:
    """Generate CloudWatch log group name for a Lambda function."""
    return f"/aws/lambda/{function_name}"


@cached("short")
def get_job_logs(job_id: str, limit: int = 1000) -> dict:
    """
    Fetch CloudWatch logs for a Glue job run.
    
    Args:
        job_id: The Glue job run ID
        limit: Maximum number of log events to return
    
    Returns:
        Dictionary with log events and metadata
    """
    try:
        logs = client("logs")
        log_group = _get_log_group_for_job(job_id)
        
        # Get log streams for this job
        streams = logs.describe_log_streams(
            logGroupName=log_group,
            logStreamNamePrefix=job_id,  # Filter streams by job ID prefix
            # orderBy="LastEventTime",
            # descending=True,
            # limit=5  # Get most recent 5 streams
        ).get("logStreams", [])
        print(f"Streams for job {job_id}: {streams}")
        if not streams:
            return {
                "jobId": job_id,
                "logGroup": log_group,
                "events": [],
                "message": "No log streams found for this job",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        
        # Collect events from all streams
        all_events = []
        for stream in streams:
            try:
                response = logs.get_log_events(
                    logGroupName=log_group,
                    logStreamName=stream["logStreamName"],
                    # limit=limit // len(streams) + 10,
                    startFromHead=True,  # Get most recent events first
                )
                
                for event in response.get("events", []):
                    all_events.append({
                        "timestamp": datetime.fromtimestamp(
                            event["timestamp"] / 1000, tz=timezone.utc
                        ).isoformat(),
                        "message": event["message"],
                        "stream": stream["logStreamName"],
                    })
            except (BotoCoreError, ClientError) as exc:
                log.warning(f"Failed to fetch logs from stream {stream['logStreamName']}: {exc}")
                continue
        
        # Sort by timestamp descending (most recent first) and limit
        print(f"all_events for job {job_id}: {all_events}")
        all_events.sort(key=lambda x: x["timestamp"], reverse=False)
        all_events = all_events[:limit]
        print(all_events)
        
        return {
            "jobId": job_id,
            "logGroup": log_group,
            "events": all_events,
            "eventCount": len(all_events),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    
    except (BotoCoreError, ClientError) as exc:
        log.error(f"Failed to fetch job logs for {job_id}: {exc}")
        return {
            "jobId": job_id,
            "error": str(exc),
            "events": [],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


@cached("short")
def get_lambda_logs(function_name: str, limit: int = 100) -> dict:
    """
    Fetch CloudWatch logs for a Lambda function invocation.
    
    Args:
        function_name: The Lambda function name
        limit: Maximum number of log events to return
    
    Returns:
        Dictionary with log events and metadata
    """
    try:
        logs = client("logs")
        log_group = _get_log_group_for_lambda(function_name)
        
        # Get log streams for this function (most recent first)
        streams = logs.describe_log_streams(
            logGroupName=log_group,
            orderBy="LastEventTime",
            descending=True,
            limit=5  # Get most recent 5 streams
        ).get("logStreams", [])
        
        if not streams:
            return {
                "functionName": function_name,
                "logGroup": log_group,
                "events": [],
                "message": "No log streams found for this function",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        
        # Collect events from all streams
        all_events = []
        for stream in streams:
            try:
                response = logs.get_log_events(
                    logGroupName=log_group,
                    logStreamName=stream["logStreamName"],
                    limit=limit // len(streams) + 10,
                    startFromHead=False,  # Get most recent events first
                )
                
                for event in response.get("events", []):
                    all_events.append({
                        "timestamp": datetime.fromtimestamp(
                            event["timestamp"] / 1000, tz=timezone.utc
                        ).isoformat(),
                        "message": event["message"],
                        "stream": stream["logStreamName"],
                    })
            except (BotoCoreError, ClientError) as exc:
                log.warning(f"Failed to fetch logs from stream {stream['logStreamName']}: {exc}")
                continue
        
        # Sort by timestamp descending (most recent first) and limit
        all_events.sort(key=lambda x: x["timestamp"], reverse=True)
        all_events = all_events[:limit]
        
        return {
            "functionName": function_name,
            "logGroup": log_group,
            "events": all_events,
            "eventCount": len(all_events),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    
    except (BotoCoreError, ClientError) as exc:
        log.error(f"Failed to fetch lambda logs for {function_name}: {exc}")
        return {
            "functionName": function_name,
            "error": str(exc),
            "events": [],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


def _fetch_group_by_identifier(log_group: str, identifier: str, id_key: str, limit: int) -> dict:
    """Shared CloudWatch fetch used by EMR: find the streams for an identifier
    (cluster/step id or job-run id) in a log group and return their events.

    Matches streams by name prefix first; falls back to recent streams whose name
    contains the identifier (EMR nests it inside the stream path)."""
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        logs = client("logs")
        streams = logs.describe_log_streams(
            logGroupName=log_group,
            logStreamNamePrefix=identifier,
            limit=50,
        ).get("logStreams", [])

        if not streams:
            recent = logs.describe_log_streams(
                logGroupName=log_group,
                orderBy="LastEventTime",
                descending=True,
                limit=50,
            ).get("logStreams", [])
            streams = [s for s in recent if identifier in s.get("logStreamName", "")]

        if not streams:
            return {
                id_key: identifier,
                "logGroup": log_group,
                "events": [],
                "message": "No log streams found for this identifier",
                "timestamp": now_iso,
            }

        all_events = []
        for stream in streams[:20]:
            try:
                response = logs.get_log_events(
                    logGroupName=log_group,
                    logStreamName=stream["logStreamName"],
                    startFromHead=True,
                )
                for event in response.get("events", []):
                    all_events.append({
                        "timestamp": datetime.fromtimestamp(
                            event["timestamp"] / 1000, tz=timezone.utc
                        ).isoformat(),
                        "message": event["message"],
                        "stream": stream["logStreamName"],
                    })
            except (BotoCoreError, ClientError) as exc:
                log.warning(f"Failed to fetch EMR logs from stream {stream['logStreamName']}: {exc}")
                continue

        all_events.sort(key=lambda x: x["timestamp"])
        all_events = all_events[:limit]
        return {
            id_key: identifier,
            "logGroup": log_group,
            "events": all_events,
            "eventCount": len(all_events),
            "timestamp": now_iso,
        }
    except (BotoCoreError, ClientError) as exc:
        log.error(f"Failed to fetch EMR logs for {identifier}: {exc}")
        return {id_key: identifier, "logGroup": log_group, "error": str(exc), "events": [], "timestamp": now_iso}


@cached("short")
def get_emr_logs(cluster_id: str, limit: int = 1000) -> dict:
    """Fetch CloudWatch logs for an EMR-on-EC2 cluster (or step id).

    Reads the configured `emr_log_group`, matching streams by the cluster/step id.
    """
    settings = get_settings()
    log_group = settings.emr_log_group
    if not log_group:
        return {
            "clusterId": cluster_id,
            "events": [],
            "message": "EMR log group not configured (set EMR_LOG_GROUP).",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    return _fetch_group_by_identifier(log_group, cluster_id, "clusterId", limit)


@cached("short")
def get_emr_serverless_logs(job_run_id: str, limit: int = 1000) -> dict:
    """Fetch CloudWatch logs for an EMR Serverless job run.

    Reads `emr_serverless_log_group` (default /aws/emr-serverless), matching streams
    by the job-run id (or an application/job path prefix).
    """
    settings = get_settings()
    return _fetch_group_by_identifier(settings.emr_serverless_log_group, job_run_id, "jobRunId", limit)
