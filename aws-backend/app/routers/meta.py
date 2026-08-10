"""Public metadata endpoints (unauthenticated) — e.g. front-end runtime config."""
from fastapi import APIRouter

from ..config import get_settings

router = APIRouter(tags=["meta"])


@router.get("/config")
def config() -> dict:
    """Runtime config the SPA needs before login (Cognito pool/client)."""
    s = get_settings()
    return {
        "cognito": {
            "userPoolId": s.cognito_user_pool_id,
            "clientId": s.cognito_client_id,
            "region": s.cognito_region or s.aws_region,
        }
    }
