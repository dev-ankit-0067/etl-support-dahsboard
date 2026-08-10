"""Cognito JWT verification for protecting API routes.

When Cognito is configured (cognito_user_pool_id + cognito_client_id), every
protected route requires a valid `Authorization: Bearer <token>` issued by the
pool. When it is not configured, the dependency is a no-op (open mode) so local
development without Cognito keeps working.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Optional

import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings

log = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)


def auth_enabled() -> bool:
    s = get_settings()
    return bool(s.cognito_user_pool_id and s.cognito_client_id)


def _issuer(region: str, pool_id: str) -> str:
    return f"https://cognito-idp.{region}.amazonaws.com/{pool_id}"


@lru_cache(maxsize=4)
def _jwks_client(region: str, pool_id: str) -> PyJWKClient:
    return PyJWKClient(f"{_issuer(region, pool_id)}/.well-known/jwks.json")


def _verify(token: str) -> dict:
    s = get_settings()
    region = s.cognito_region or s.aws_region
    pool_id = s.cognito_user_pool_id
    client_id = s.cognito_client_id

    signing_key = _jwks_client(region, pool_id).get_signing_key_from_jwt(token)
    # Verifies signature (RS256), expiry, and issuer. Audience is checked below
    # because ID and access tokens carry the client id in different claims.
    claims = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        issuer=_issuer(region, pool_id),
        options={"verify_aud": False},
    )

    token_use = claims.get("token_use")
    if token_use == "id":
        if claims.get("aud") != client_id:
            raise jwt.InvalidTokenError("audience mismatch")
    elif token_use == "access":
        if claims.get("client_id") != client_id:
            raise jwt.InvalidTokenError("client_id mismatch")
    else:
        raise jwt.InvalidTokenError("unexpected token_use")

    return claims


def require_auth(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[dict]:
    """FastAPI dependency: enforce a valid Cognito token when auth is configured."""
    if not auth_enabled():
        return None  # open mode — Cognito not configured

    if creds is None or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return _verify(creds.credentials)
    except Exception as exc:  # noqa: BLE001 — any failure is an auth failure
        log.info("JWT verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
