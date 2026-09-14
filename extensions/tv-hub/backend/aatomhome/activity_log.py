"""Hub activity log — TV app API events surfaced in the admin UI."""

from __future__ import annotations

import asyncio
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any

import database as db

_MAX_ENTRIES = 500
_entries: deque[dict[str, Any]] = deque(maxlen=_MAX_ENTRIES)
_next_id = 0
_lock = asyncio.Lock()
_throttle: dict[str, float] = {}
_agent_online: dict[int, bool] = {}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _should_log(throttle_key: str | None, throttle_seconds: float) -> bool:
    if not throttle_key or throttle_seconds <= 0:
        return True
    now = time.monotonic()
    last = _throttle.get(throttle_key, 0.0)
    if now - last < throttle_seconds:
        return False
    _throttle[throttle_key] = now
    return True


async def record_activity(
    *,
    level: str = "info",
    category: str = "tv-app",
    message: str,
    device_id: int | None = None,
    device_name: str | None = None,
    details: str | None = None,
    throttle_key: str | None = None,
    throttle_seconds: float = 0,
) -> dict[str, Any] | None:
    if not message:
        return None
    if not _should_log(throttle_key, throttle_seconds):
        return None

    if device_id is not None and not device_name:
        try:
            device = await db.get_device(device_id)
            if device:
                device_name = device.get("name") or f"TV {device_id}"
        except Exception:
            device_name = f"TV {device_id}"

    global _next_id
    async with _lock:
        _next_id += 1
        entry = {
            "id": _next_id,
            "ts": _utc_now(),
            "level": level,
            "category": category,
            "message": message,
            "deviceId": device_id,
            "deviceName": device_name,
            "details": details,
            "source": "server",
        }
        _entries.append(entry)
        return dict(entry)


async def list_entries(since: int = 0, limit: int = 100) -> list[dict[str, Any]]:
    async with _lock:
        rows = [e for e in _entries if int(e.get("id") or 0) > since]
    if limit > 0:
        rows = rows[-limit:]
    return rows


async def latest_id() -> int:
    async with _lock:
        if not _entries:
            return 0
        return int(_entries[-1]["id"])


async def note_agent_poll(device_id: int, device_name: str | None = None) -> None:
    was_online = _agent_online.get(device_id, False)
    _agent_online[device_id] = True
    if not was_online:
        await record_activity(
            level="success",
            category="tv-app",
            message="Guest app connected — TV agent polling",
            device_id=device_id,
            device_name=device_name,
        )


async def note_agent_disconnect(device_id: int, device_name: str | None = None) -> None:
    if not _agent_online.get(device_id):
        return
    _agent_online[device_id] = False
    await record_activity(
        level="warn",
        category="tv-app",
        message="Guest app disconnected — TV agent offline",
        device_id=device_id,
        device_name=device_name,
    )
