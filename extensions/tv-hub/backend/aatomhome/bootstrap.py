"""Register aatomhome routes on the upstream FastAPI app."""

from __future__ import annotations

import logging
import re

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .activity_log_routes import router as activity_log_router
from .ha_dashboard_routes import router as ha_dashboard_router
from .launcher_routes import router as launcher_router
from .registry_routes import router as registry_router
from .room_routes import router as room_router
from .setup_routes import router as setup_router
from .setup_store import init_setup_tables
from .store import init_extension_tables
from .tv_agent_ws import router as agent_router

logger = logging.getLogger("aatomhome")


async def init_aatomhome_db() -> None:
    """Called from main.py lifespan — on_event startup does not run with lifespan apps."""
    await init_extension_tables()
    await init_setup_tables()
    logger.info("aatomhome extension tables ready")


_DOUBLED_ONBOARD_PAGE = re.compile(r"/guest/onboard/onboard(?=/|$)")


def _fix_doubled_onboard_path(path: str) -> str | None:
    """Collapse /guest/onboard/onboard/ page URLs — never touch onboard.css / onboard.js."""
    if not _DOUBLED_ONBOARD_PAGE.search(path):
        return None
    fixed = path
    while _DOUBLED_ONBOARD_PAGE.search(fixed):
        fixed = _DOUBLED_ONBOARD_PAGE.sub("/guest/onboard", fixed, count=1)
    return fixed if fixed != path else None


class _GuestOnboardRedirectMiddleware(BaseHTTPMiddleware):
    """Repair /guest/onboard/onboard/ URLs from a bad APK rebuild (before static /guest mount)."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        fixed = _fix_doubled_onboard_path(path)
        if fixed:
            return RedirectResponse(url=fixed, status_code=307)
        return await call_next(request)


def install_aatomhome_extensions(app: FastAPI) -> None:
    """Mount claim/room-config APIs and TV agent WebSocket."""

    app.add_middleware(_GuestOnboardRedirectMiddleware)
    app.include_router(activity_log_router)
    app.include_router(registry_router)
    app.include_router(room_router)
    app.include_router(ha_dashboard_router)
    app.include_router(setup_router)
    app.include_router(launcher_router)
    app.include_router(agent_router)
    logger.info("aatomhome extensions installed")
