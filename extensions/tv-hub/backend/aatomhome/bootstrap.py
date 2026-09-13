"""Register aatomhome routes on the upstream FastAPI app."""

from __future__ import annotations

import logging

from fastapi import FastAPI

from .registry_routes import router as registry_router
from .store import init_extension_tables
from .tv_agent_ws import router as agent_router

logger = logging.getLogger("aatomhome")


def install_aatomhome_extensions(app: FastAPI) -> None:
    """Mount claim/room-config APIs and TV agent WebSocket."""

    @app.on_event("startup")
    async def _aatomhome_startup() -> None:
        await init_extension_tables()
        logger.info("aatomhome extension tables ready")

    app.include_router(registry_router)
    app.include_router(agent_router)
    logger.info("aatomhome extensions installed")
