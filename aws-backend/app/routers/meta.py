"""Public metadata endpoints (unauthenticated) — e.g. front-end runtime config."""
from fastapi import APIRouter

from .. import remote_config
from ..config import get_settings

router = APIRouter(tags=["meta"])

_PROVIDER_LABELS = {"jira": "Jira", "servicenow": "ServiceNow"}


@router.get("/config")
def config() -> dict:
    """Runtime config the SPA needs before login (Cognito pool/client, incident provider)."""
    s = get_settings()
    provider = remote_config.incident_provider()
    return {
        "cognito": {
            "userPoolId": s.cognito_user_pool_id,
            "clientId": s.cognito_client_id,
            "region": s.cognito_region or s.aws_region,
        },
        # Which ticketing backend is active, so the SPA can label buttons/badges.
        "incidentProvider": provider,
        "incidentProviderLabel": _PROVIDER_LABELS.get(provider, provider.title()),
    }


@router.get("/projects")
def projects() -> dict:
    """Project options for the dropdown: 'all' (no filter) + configured tag values.

    `labels` maps each project value to its custom S3 log-source label (from the
    remote config's `s3LogLabel`), so the frontend can rename the S3 entry per tag.
    """
    values = remote_config.project_values()
    return {
        "tagKey": remote_config.tag_key(),
        "projects": ["all", *values],
        "labels": {v: lbl for v in values if (lbl := remote_config.s3_log_label(v))},
    }
