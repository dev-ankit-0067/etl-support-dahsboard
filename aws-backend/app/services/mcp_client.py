"""Synchronous bridge to an in-process MCP server spawned over stdio.

The FastAPI backend is the MCP *client*: it launches one of the servers in
``app.mcp_servers`` as a subprocess and calls its tools. The MCP SDK is async and
long-lived (the subprocess stays up), while our service layer is synchronous and
runs in a threadpool. This module bridges the two by owning a dedicated event
loop in a background thread that holds the persistent ``ClientSession``; callers
use the blocking :meth:`StdioMcpClient.call`.

One client is created per provider (keyed by INCIDENT_PROVIDER) and reused for
the life of the worker process.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import threading
from pathlib import Path
from typing import Any, Dict, Optional

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from ..config import get_settings
from .. import remote_config

log = logging.getLogger(__name__)

# aws-backend/ — parent of the `app` package, so the subprocess resolves .env locally.
_BACKEND_DIR = str(Path(__file__).resolve().parents[2])

# INCIDENT_PROVIDER -> module run as `python -m <module>`
_PROVIDER_MODULES = {
    "jira": "app.mcp_servers.jira_server",
    "servicenow": "app.mcp_servers.servicenow_server",
}


def _parse_result(result: Any) -> Any:
    """Unwrap a CallToolResult into plain Python (list/dict/str)."""
    if getattr(result, "isError", False):
        raise RuntimeError(_result_text(result) or "MCP tool returned an error")

    structured = getattr(result, "structuredContent", None)
    if structured is not None:
        # FastMCP wraps non-object returns (e.g. a list) as {"result": <value>}.
        if isinstance(structured, dict) and set(structured.keys()) == {"result"}:
            return structured["result"]
        return structured

    text = _result_text(result)
    if text:
        try:
            return json.loads(text)
        except (ValueError, TypeError):
            return text
    return None


def _result_text(result: Any) -> str:
    parts = []
    for item in getattr(result, "content", None) or []:
        t = getattr(item, "text", None)
        if t:
            parts.append(t)
    return "\n".join(parts)


class StdioMcpClient:
    """Owns a persistent stdio MCP session on a private event-loop thread."""

    def __init__(self, module: str, name: str, call_timeout: float = 90.0):
        self._params = StdioServerParameters(
            command=sys.executable,
            args=["-m", module],
            env=dict(os.environ),
            cwd=_BACKEND_DIR,
        )
        self._name = name
        self._call_timeout = call_timeout
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._session: Optional[ClientSession] = None
        self._closed: Optional[asyncio.Event] = None
        self._ready = threading.Event()
        self._start_lock = threading.Lock()
        self._started = False

    # ---- lifecycle -----------------------------------------------------
    def _ensure_started(self) -> None:
        if self._started and self._session is not None:
            return
        with self._start_lock:
            if self._started and self._session is not None:
                return
            self._ready.clear()
            thread = threading.Thread(target=self._thread_main, name=f"{self._name}-mcp", daemon=True)
            thread.start()
            if not self._ready.wait(timeout=45):
                raise RuntimeError(f"MCP server '{self._name}' did not start within 45s")
            if self._session is None:
                raise RuntimeError(f"MCP server '{self._name}' failed to initialize")
            self._started = True

    def _thread_main(self) -> None:
        loop = asyncio.new_event_loop()
        self._loop = loop
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._serve())
        except Exception:  # noqa: BLE001
            log.exception("MCP server '%s' loop terminated", self._name)
        finally:
            self._session = None
            self._started = False
            self._ready.set()  # unblock any waiter so it fails fast rather than hanging
            try:
                loop.close()
            except Exception:  # noqa: BLE001
                pass

    async def _serve(self) -> None:
        self._closed = asyncio.Event()
        try:
            async with stdio_client(self._params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    self._session = session
                    log.info("MCP server '%s' ready", self._name)
                    self._ready.set()
                    await self._closed.wait()
        finally:
            self._session = None

    # ---- calls ---------------------------------------------------------
    def call(self, tool: str, arguments: Optional[Dict[str, Any]] = None) -> Any:
        self._ensure_started()
        assert self._loop is not None and self._session is not None
        future = asyncio.run_coroutine_threadsafe(
            self._session.call_tool(tool, arguments or {}), self._loop
        )
        try:
            result = future.result(timeout=self._call_timeout)
        except Exception:
            # A crashed/broken subprocess must not wedge the singleton forever.
            self._started = False
            self._session = None
            raise
        return _parse_result(result)


_clients: Dict[str, StdioMcpClient] = {}
_registry_lock = threading.Lock()


def get_provider_client() -> StdioMcpClient:
    """Return the MCP client for the configured incident provider (singleton)."""
    provider = remote_config.incident_provider()
    module = _PROVIDER_MODULES.get(provider)
    if module is None:
        raise ValueError(
            f"Unknown INCIDENT_PROVIDER '{provider}'. Expected one of: {', '.join(_PROVIDER_MODULES)}"
        )
    with _registry_lock:
        client = _clients.get(provider)
        if client is None:
            client = StdioMcpClient(module=module, name=provider)
            _clients[provider] = client
        return client
