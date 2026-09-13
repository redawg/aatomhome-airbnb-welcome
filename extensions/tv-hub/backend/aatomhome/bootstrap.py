"""Register aatomhome routes on the upstream FastAPI app."""

from __future__ import annotations

import logging

from fastapi import FastAPI

from .launcher_routes import router as launcher_router
from .registry_routes import router as registry_router
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


def install_aatomhome_extensions(app: FastAPI) -> None:
    """Mount claim/room-config APIs and TV agent WebSocket."""

    app.include_router(registry_router)
    app.include_router(setup_router)
    app.include_router(launcher_router)
    app.include_router(agent_router)
    logger.info("aatomhome extensions installed")
