"""FastAPI application factory and entrypoint."""
from __future__ import annotations

import logging

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .auth import require_auth
from .config import get_settings
from .context import current_project
from .logging_config import configure_logging
from .routers import (
    agents, cloudwatch, costs, emr, emr_serverless, health, incidents,
    lambdas, meta, overview, pipelines, rca,
)

log = logging.getLogger(__name__)


class ProjectContextMiddleware:
    """Pure-ASGI middleware: set the per-request project from the X-Project header.

    (A raw ASGI middleware — not BaseHTTPMiddleware — so the contextvar it sets is
    visible in the endpoint, including sync endpoints run in the threadpool.)
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        raw = dict(scope.get("headers") or {}).get(b"x-project")
        value = raw.decode() if raw else None
        token = current_project.set(None if not value or value.lower() == "all" else value)
        try:
            await self.app(scope, receive, send)
        finally:
            current_project.reset(token)


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()

    app = FastAPI(
        title="ETL Production Support & Cost Insights API",
        version=__version__,
        description="AWS-backed API for the Production Support & Cost Insights Dashboard.",
        docs_url="/docs",
        redoc_url=None,
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )
    app.add_middleware(ProjectContextMiddleware)

    # Health (root) and /config (meta) are public; everything else requires a
    # valid Cognito token when auth is configured.
    app.include_router(health.router)
    app.include_router(meta.router, prefix=settings.api_prefix)
    protected_routers = [
        overview.router,
        pipelines.router,
        lambdas.router,
        emr.router,
        emr_serverless.router,
        incidents.router,
        costs.router,
        rca.router,
        cloudwatch.router,
        agents.router,
    ]
    for r in protected_routers:
        app.include_router(r, prefix=settings.api_prefix, dependencies=[Depends(require_auth)])

    @app.exception_handler(ClientError)
    async def _client_error(_: Request, exc: ClientError) -> JSONResponse:
        code = exc.response.get("Error", {}).get("Code", "AWSClientError")
        log.warning("AWS ClientError: %s", code)
        status = 502 if code in {"ThrottlingException", "RequestLimitExceeded"} else 500
        return JSONResponse(status_code=status, content={"error": code, "message": str(exc)})

    @app.exception_handler(BotoCoreError)
    async def _botocore_error(_: Request, exc: BotoCoreError) -> JSONResponse:
        log.error("BotoCoreError: %s", exc)
        return JSONResponse(status_code=502, content={"error": "AWSConnectivity", "message": str(exc)})

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("Unhandled error")
        return JSONResponse(status_code=500, content={"error": "InternalServerError", "message": str(exc)})

    return app


app = create_app()
