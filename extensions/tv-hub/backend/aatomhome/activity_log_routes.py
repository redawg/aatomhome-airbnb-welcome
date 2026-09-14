"""Activity log API for the hub admin UI."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from .activity_log import latest_id, list_entries

router = APIRouter(tags=["aatomhome"])


@router.get("/api/aatomhome/activity-log")
async def get_activity_log(
    since: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=300),
) -> dict[str, Any]:
    entries = await list_entries(since=since, limit=limit)
    return {
        "ok": True,
        "since": since,
        "latest_id": await latest_id(),
        "entries": entries,
    }
