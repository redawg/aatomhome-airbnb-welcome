"""Persist hub setup settings (Home Assistant URL/token, property label)."""

from __future__ import annotations

import os
from typing import Any

import aiosqlite

from .store import DB_PATH

_SETTINGS_KEYS = (
    "property_name",
    "managing_company",
    "ha_url",
    "ha_token",
    "active_property_id",
)


async def init_setup_tables() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS aatomhome_hub_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT ''
            )
            """
        )
        await db.commit()


async def get_setting(key: str, default: str = "") -> str:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT value FROM aatomhome_hub_settings WHERE key = ?",
            (key,),
        ) as cur:
            row = await cur.fetchone()
            if row and row[0]:
                return str(row[0])
    env_map = {
        "ha_url": os.environ.get("HA_URL", ""),
        "ha_token": os.environ.get("HA_LONG_LIVED_TOKEN", "") or os.environ.get("HA_TOKEN", ""),
        "property_name": os.environ.get("PROPERTY_NAME", ""),
        "managing_company": os.environ.get("MANAGING_COMPANY", ""),
        "active_property_id": os.environ.get("PROPERTY_ID", "1"),
    }
    return env_map.get(key, default) or default


async def get_managing_company() -> str:
    """Hub-wide company shown on guest welcome (e.g. Asholding LLC)."""
    company = (await get_setting("managing_company")).strip()
    if company:
        return company
    return (await get_setting("property_name")).strip()


async def set_setting(key: str, value: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO aatomhome_hub_settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (key, value or ""),
        )
        await db.commit()


async def get_ha_config() -> dict[str, str]:
    return {
        "ha_url": (await get_setting("ha_url")).strip().rstrip("/"),
        "ha_token": (await get_setting("ha_token")).strip(),
    }


async def save_ha_config(ha_url: str | None = None, ha_token: str | None = None) -> dict[str, Any]:
    if ha_url is not None:
        await set_setting("ha_url", ha_url.strip().rstrip("/"))
    if ha_token is not None:
        await set_setting("ha_token", ha_token.strip())
    cfg = await get_ha_config()
    return {
        "ha_url": cfg["ha_url"],
        "token_configured": bool(cfg["ha_token"]),
        "token_preview": _token_preview(cfg["ha_token"]),
    }


def _token_preview(token: str) -> str:
    if not token:
        return ""
    if len(token) <= 8:
        return "••••"
    return f"••••{token[-4:]}"
